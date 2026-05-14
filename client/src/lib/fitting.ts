/**
 * Data Fitting Analysis Engine
 * 
 * Supports:
 * 1. Linear fit: y = mx + b
 * 2. Polynomial fit: y = Σ aᵢxⁱ (degree 1-5)
 * 3. Power-law fit: y = A·x^b (via log-log linear regression)
 * 4. Weighted fitting with uncertainties
 * 5. Outlier detection (z-score and IQR methods)
 * 
 * Uses Vandermonde matrix + least squares for polynomial fitting
 * All statistical measures: R², standard errors, 95% CI
 */

export interface DataPoint {
  x: number;
  y: number;
  dy?: number; // uncertainty in y
  enabled: boolean;
  isOutlier?: boolean;
}

export interface FitResult {
  type: 'linear' | 'polynomial' | 'power';
  params: number[];       // [m, b] for linear; [a0, a1, ...] for poly; [A, b] for power
  paramNames: string[];
  paramErrors: number[];  // standard errors
  ci95: [number, number][]; // 95% confidence intervals
  rSquared: number;
  residuals: number[];
  fittedValues: number[];
  equation: string;
  physicalMeaning?: string;
  warning?: string;
}

/**
 * Linear regression: y = mx + b
 * Returns slope (m), intercept (b), R², standard errors
 */
export function linearFit(
  data: DataPoint[],
  weighted: boolean = false
): FitResult {
  const pts = data.filter(d => d.enabled);
  const n = pts.length;
  
  if (n < 2) {
    return emptyFitResult('linear', '数据点不足，至少需要2个点进行线性拟合');
  }
  
  let sumW = 0, sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
  
  for (const p of pts) {
    const w = weighted && p.dy && p.dy > 0 ? 1 / (p.dy * p.dy) : 1;
    sumW += w;
    sumX += w * p.x;
    sumY += w * p.y;
    sumXX += w * p.x * p.x;
    sumXY += w * p.x * p.y;
  }
  
  const det = sumW * sumXX - sumX * sumX;
  if (Math.abs(det) < 1e-30) {
    return emptyFitResult('linear', '数据退化，无法拟合');
  }
  
  const m = (sumW * sumXY - sumX * sumY) / det;
  const b = (sumXX * sumY - sumX * sumXY) / det;
  
  // Calculate R² and residuals
  const yMean = sumY / sumW;
  let ssTot = 0, ssRes = 0;
  const residuals: number[] = [];
  const fittedValues: number[] = [];
  
  for (const p of pts) {
    const w = weighted && p.dy && p.dy > 0 ? 1 / (p.dy * p.dy) : 1;
    const yFit = m * p.x + b;
    fittedValues.push(yFit);
    const res = p.y - yFit;
    residuals.push(res);
    ssRes += w * res * res;
    ssTot += w * (p.y - yMean) * (p.y - yMean);
  }
  
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  
  // Standard errors
  const s2 = n > 2 ? ssRes / (n - 2) : 0;
  const seM = Math.sqrt(s2 * sumW / det);
  const seB = Math.sqrt(s2 * sumXX / det);
  
  // 95% CI (t ≈ 1.96 for large n)
  const t95 = n > 30 ? 1.96 : getTValue(n - 2);
  
  return {
    type: 'linear',
    params: [m, b],
    paramNames: ['斜率 m', '截距 b'],
    paramErrors: [seM, seB],
    ci95: [
      [m - t95 * seM, m + t95 * seM],
      [b - t95 * seB, b + t95 * seB],
    ],
    rSquared,
    residuals,
    fittedValues,
    equation: `y = ${formatSci(m)}x ${b >= 0 ? '+' : ''} ${formatSci(b)}`,
  };
}

/**
 * Polynomial regression: y = a₀ + a₁x + a₂x² + ... + aₙxⁿ
 * Uses Vandermonde matrix and normal equations
 * Includes light regularization for numerical stability
 */
export function polynomialFit(
  data: DataPoint[],
  degree: number,
  weighted: boolean = false
): FitResult {
  const pts = data.filter(d => d.enabled);
  const n = pts.length;
  
  if (n <= degree) {
    return emptyFitResult('polynomial', `数据点(${n})不足，${degree}次多项式至少需要${degree + 1}个点`);
  }
  
  const p = degree + 1;
  
  // Build normal equations: (X^T W X + λI) a = X^T W y
  const XtWX = new Array(p).fill(0).map(() => new Array(p).fill(0));
  const XtWy = new Array(p).fill(0);
  
  for (const pt of pts) {
    const w = weighted && pt.dy && pt.dy > 0 ? 1 / (pt.dy * pt.dy) : 1;
    const xPowers = new Array(p);
    xPowers[0] = 1;
    for (let j = 1; j < p; j++) xPowers[j] = xPowers[j - 1] * pt.x;
    
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) {
        XtWX[i][j] += w * xPowers[i] * xPowers[j];
      }
      XtWy[i] += w * xPowers[i] * pt.y;
    }
  }
  
  // Light regularization (ridge regression, λ = 1e-10)
  const lambda = 1e-10;
  for (let i = 0; i < p; i++) {
    XtWX[i][i] += lambda;
  }
  
  // Solve using Gaussian elimination
  const coeffs = solveLinearSystem(XtWX, XtWy);
  if (!coeffs) {
    return emptyFitResult('polynomial', '矩阵求解失败，数据可能退化');
  }
  
  // Calculate R² and residuals
  let ySum = 0;
  for (const pt of pts) ySum += pt.y;
  const yMean = ySum / n;
  
  let ssTot = 0, ssRes = 0;
  const residuals: number[] = [];
  const fittedValues: number[] = [];
  
  for (const pt of pts) {
    const w = weighted && pt.dy && pt.dy > 0 ? 1 / (pt.dy * pt.dy) : 1;
    let yFit = 0;
    let xPow = 1;
    for (let j = 0; j < p; j++) {
      yFit += coeffs[j] * xPow;
      xPow *= pt.x;
    }
    fittedValues.push(yFit);
    const res = pt.y - yFit;
    residuals.push(res);
    ssRes += w * res * res;
    ssTot += w * (pt.y - yMean) * (pt.y - yMean);
  }
  
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  
  // Standard errors (approximate)
  const s2 = n > p ? ssRes / (n - p) : 0;
  const paramErrors = coeffs.map(() => Math.sqrt(s2)); // Simplified
  
  const t95 = n > 30 ? 1.96 : getTValue(Math.max(1, n - p));
  const ci95: [number, number][] = coeffs.map((c, i) => [
    c - t95 * paramErrors[i],
    c + t95 * paramErrors[i],
  ]);
  
  // Build equation string
  const terms = coeffs.map((c, i) => {
    if (i === 0) return formatSci(c);
    if (i === 1) return `${formatSci(c)}x`;
    return `${formatSci(c)}x^${i}`;
  });
  
  return {
    type: 'polynomial',
    params: coeffs,
    paramNames: coeffs.map((_, i) => `a${i}`),
    paramErrors,
    ci95,
    rSquared,
    residuals,
    fittedValues,
    equation: `y = ${terms.join(' + ')}`,
    warning: degree >= 3 ? '高次多项式可能过拟合，请考虑物理模型是否合理' : undefined,
  };
}

/**
 * Power-law fit: y = A·x^b
 * Method: log(y) = log(A) + b·log(x), then linear regression in log-log space
 * 
 * Physical applications:
 * - L ∝ R² → b ≈ 2
 * - L ∝ N² → b ≈ 2
 * - M ∝ d^(-n) → b ≈ -n
 */
export function powerLawFit(
  data: DataPoint[],
  weighted: boolean = false
): FitResult {
  const pts = data.filter(d => d.enabled && d.x > 0 && d.y > 0);
  
  if (pts.length < 2) {
    return emptyFitResult('power', '幂律拟合需要至少2个正值数据点 (x > 0, y > 0)');
  }
  
  // Transform to log-log space
  const logData: DataPoint[] = pts.map(p => ({
    x: Math.log(p.x),
    y: Math.log(p.y),
    dy: p.dy && p.dy > 0 ? p.dy / p.y : undefined, // Error propagation: Δ(ln y) ≈ Δy/y
    enabled: true,
  }));
  
  const logFit = linearFit(logData, weighted);
  
  const b = logFit.params[0]; // slope = exponent
  const lnA = logFit.params[1]; // intercept = ln(A)
  const A = Math.exp(lnA);
  
  // Calculate R² in original space
  let ySum = 0;
  for (const p of pts) ySum += p.y;
  const yMean = ySum / pts.length;
  
  let ssTot = 0, ssRes = 0;
  const residuals: number[] = [];
  const fittedValues: number[] = [];
  
  for (const p of pts) {
    const yFit = A * Math.pow(p.x, b);
    fittedValues.push(yFit);
    const res = p.y - yFit;
    residuals.push(res);
    ssRes += res * res;
    ssTot += (p.y - yMean) * (p.y - yMean);
  }
  
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  
  // Standard errors from log-space
  const seB = logFit.paramErrors[0];
  const seLnA = logFit.paramErrors[1];
  const seA = A * seLnA; // Error propagation
  
  const t95 = pts.length > 30 ? 1.96 : getTValue(Math.max(1, pts.length - 2));
  
  return {
    type: 'power',
    params: [A, b],
    paramNames: ['系数 A', '指数 b'],
    paramErrors: [seA, seB],
    ci95: [
      [A - t95 * seA, A + t95 * seA],
      [b - t95 * seB, b + t95 * seB],
    ],
    rSquared,
    residuals,
    fittedValues,
    equation: `y = ${formatSci(A)} × x^${b.toFixed(3)}`,
  };
}

/**
 * Detect outliers using z-score method (±3σ)
 */
export function detectOutliersZScore(data: DataPoint[], fit: FitResult): boolean[] {
  const residuals = fit.residuals;
  const enabled = data.filter(d => d.enabled);
  
  if (residuals.length < 3) return data.map(() => false);
  
  const mean = residuals.reduce((s, r) => s + r, 0) / residuals.length;
  const std = Math.sqrt(
    residuals.reduce((s, r) => s + (r - mean) ** 2, 0) / (residuals.length - 1)
  );
  
  if (std < 1e-15) return data.map(() => false);
  
  const result = data.map(() => false);
  let enabledIdx = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i].enabled) {
      const zScore = Math.abs((residuals[enabledIdx] - mean) / std);
      result[i] = zScore > 3;
      enabledIdx++;
    }
  }
  
  return result;
}

/**
 * Detect outliers using IQR method
 */
export function detectOutliersIQR(data: DataPoint[], fit: FitResult): boolean[] {
  const residuals = [...fit.residuals].sort((a, b) => a - b);
  const n = residuals.length;
  
  if (n < 4) return data.map(() => false);
  
  const q1 = residuals[Math.floor(n * 0.25)];
  const q3 = residuals[Math.floor(n * 0.75)];
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  
  const result = data.map(() => false);
  let enabledIdx = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i].enabled) {
      result[i] = fit.residuals[enabledIdx] < lower || fit.residuals[enabledIdx] > upper;
      enabledIdx++;
    }
  }
  
  return result;
}

/**
 * Generate example datasets for teaching
 */
export function generateExampleData(
  type: 'L_vs_N2' | 'L_vs_R2' | 'M_vs_d',
  noiseLevel: number = 0.005 // 0.5% noise
): DataPoint[] {
  const addNoise = (val: number) => val * (1 + (Math.random() - 0.5) * 2 * noiseLevel);
  
  switch (type) {
    case 'L_vs_N2': {
      // L = μ₀N²πR²/l, with R=0.05m, l=0.1m
      // L ≈ 1.23×10⁻⁶ × N²
      const R = 0.05, l = 0.1;
      const coeff = 4 * Math.PI * 1e-7 * Math.PI * R * R / l;
      return [5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100].map(N => ({
        x: N,
        y: addNoise(coeff * N * N),
        dy: coeff * N * N * noiseLevel * 2,
        enabled: true,
      }));
    }
    case 'L_vs_R2': {
      // L = μ₀N²πR²/l, with N=50, l=0.1m
      // L ∝ R²
      const N = 50, l = 0.1;
      const coeff = 4 * Math.PI * 1e-7 * N * N * Math.PI / l;
      return [0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.12, 0.15, 0.2].map(R => ({
        x: R,
        y: addNoise(coeff * R * R),
        dy: coeff * R * R * noiseLevel * 2,
        enabled: true,
      }));
    }
    case 'M_vs_d': {
      // M ∝ d^(-3) for two coaxial coils at large separation
      // M ≈ μ₀πR₁²R₂²N₁N₂/(2d³)
      const R1 = 0.05, R2 = 0.05, N1 = 10, N2 = 10;
      const coeff = 4 * Math.PI * 1e-7 * Math.PI * R1 * R1 * R2 * R2 * N1 * N2 / 2;
      return [0.05, 0.06, 0.08, 0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5].map(d => ({
        x: d,
        y: addNoise(coeff / (d * d * d)),
        dy: coeff / (d * d * d) * noiseLevel * 2,
        enabled: true,
      }));
    }
  }
}

// Helper: Gaussian elimination for solving Ax = b
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const aug = A.map((row, i) => [...row, b[i]]);
  
  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) {
        maxRow = row;
      }
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    
    if (Math.abs(aug[col][col]) < 1e-20) return null;
    
    // Eliminate
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }
  
  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= aug[i][j] * x[j];
    }
    x[i] /= aug[i][i];
  }
  
  return x;
}

// Helper: t-distribution critical values for 95% CI
function getTValue(df: number): number {
  // Approximate t-values for common degrees of freedom
  const table: Record<number, number> = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
    6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
    15: 2.131, 20: 2.086, 25: 2.060, 30: 2.042,
  };
  if (df <= 0) return 1.96;
  if (table[df]) return table[df];
  // Interpolate or use large-sample approximation
  if (df > 30) return 1.96;
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < keys.length - 1; i++) {
    if (df > keys[i] && df < keys[i + 1]) {
      const t1 = table[keys[i]], t2 = table[keys[i + 1]];
      const frac = (df - keys[i]) / (keys[i + 1] - keys[i]);
      return t1 + frac * (t2 - t1);
    }
  }
  return 1.96;
}

// Helper: format number in scientific notation
export function formatSci(val: number, digits: number = 3): string {
  if (Math.abs(val) < 1e-15) return '0';
  const exp = Math.floor(Math.log10(Math.abs(val)));
  if (exp >= -2 && exp <= 3) {
    return val.toFixed(Math.max(0, digits - exp - 1));
  }
  const mantissa = val / Math.pow(10, exp);
  return `${mantissa.toFixed(digits - 1)}×10^${exp}`;
}

function emptyFitResult(type: FitResult['type'], warning: string): FitResult {
  return {
    type,
    params: [],
    paramNames: [],
    paramErrors: [],
    ci95: [],
    rSquared: 0,
    residuals: [],
    fittedValues: [],
    equation: '',
    warning,
  };
}
