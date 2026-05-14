/**
 * Biot-Savart Law Magnetic Field Calculator
 * 
 * Physical Model: dB = (μ₀/4π) × (I·dl × r̂) / r²
 * 
 * μ₀ = 4π × 10⁻⁷ T·m/A (permeability of free space)
 * All units in SI: meters, amperes, tesla
 */

// Physical constants
export const MU_0 = 4 * Math.PI * 1e-7; // T·m/A, permeability of free space
const MU_0_OVER_4PI = 1e-7; // μ₀/(4π) = 10⁻⁷ T·m/A

// Vector operations
export type Vec3 = [number, number, number];

export function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function vecSub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function vecScale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function vecCross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

export function vecDot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function vecMag(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

export function vecNormalize(v: Vec3): Vec3 {
  const m = vecMag(v);
  if (m < 1e-15) return [0, 0, 0];
  return [v[0] / m, v[1] / m, v[2] / m];
}

/**
 * Coil parameters
 */
export interface CoilParams {
  radius: number;      // R in meters (0.05 - 0.5)
  current: number;     // I in amperes (0 - 10)
  turns: number;       // N number of turns (1 - 100)
  pitch: number;       // distance between turns in meters
  position: Vec3;      // center position [x, y, z]
  rotation: number;    // rotation around z-axis in radians
  direction: 1 | -1;   // winding direction (CW/CCW)
}

export const DEFAULT_COIL: CoilParams = {
  radius: 0.1,
  current: 1.0,
  turns: 1,
  pitch: 0.01,
  position: [0, 0, 0],
  rotation: 0,
  direction: 1,
};

/**
 * Generate points along a circular coil (or solenoid)
 * Returns array of [position, dl_vector] pairs for Biot-Savart integration
 * 
 * For a single coil: N=1, pitch=0, coil lies in xy-plane
 * For a solenoid: N>1, pitch>0, coil extends along z-axis
 */
export function generateCoilSegments(
  params: CoilParams,
  segmentsPerTurn: number = 64
): { pos: Vec3; dl: Vec3 }[] {
  const { radius, turns, pitch, position, rotation, direction } = params;
  const totalSegments = segmentsPerTurn * turns;
  const segments: { pos: Vec3; dl: Vec3 }[] = [];
  
  // Total length along z-axis for solenoid
  const totalLength = (turns - 1) * pitch;
  const zStart = -totalLength / 2;
  
  const cosRot = Math.cos(rotation);
  const sinRot = Math.sin(rotation);
  
  for (let i = 0; i < totalSegments; i++) {
    const t = i / totalSegments;
    const theta = 2 * Math.PI * t * turns * direction;
    const tNext = (i + 1) / totalSegments;
    const thetaNext = 2 * Math.PI * tNext * turns * direction;
    
    // Position on coil (before rotation and translation)
    const z = zStart + t * totalLength;
    const x = radius * Math.cos(theta);
    const y = radius * Math.sin(theta);
    
    const zNext = zStart + tNext * totalLength;
    const xNext = radius * Math.cos(thetaNext);
    const yNext = radius * Math.sin(thetaNext);
    
    // Apply rotation around z-axis
    const px = x * cosRot - y * sinRot + position[0];
    const py = x * sinRot + y * cosRot + position[1];
    const pz = z + position[2];
    
    const pxNext = xNext * cosRot - yNext * sinRot + position[0];
    const pyNext = xNext * sinRot + yNext * cosRot + position[1];
    const pzNext = zNext + position[2];
    
    // dl = next_pos - current_pos
    const dl: Vec3 = [pxNext - px, pyNext - py, pzNext - pz];
    
    segments.push({ pos: [px, py, pz], dl });
  }
  
  return segments;
}

/**
 * Calculate magnetic field B at a point due to a coil using Biot-Savart law
 * 
 * B = (μ₀I/4π) Σ (dl × r̂) / r²
 * 
 * where r̂ is the unit vector from dl to the field point
 */
export function calculateBField(
  point: Vec3,
  coilParams: CoilParams,
  segmentsPerTurn: number = 64
): Vec3 {
  const segments = generateCoilSegments(coilParams, segmentsPerTurn);
  const I = coilParams.current;
  
  let Bx = 0, By = 0, Bz = 0;
  const prefactor = MU_0_OVER_4PI * I;
  
  for (const seg of segments) {
    // r = point - segment_position (vector from source to field point)
    const rx = point[0] - seg.pos[0];
    const ry = point[1] - seg.pos[1];
    const rz = point[2] - seg.pos[2];
    
    const r2 = rx * rx + ry * ry + rz * rz;
    if (r2 < 1e-20) continue; // Skip if too close (numerical stability)
    
    const rMag = Math.sqrt(r2);
    const r3 = r2 * rMag;
    
    // dB = (μ₀I/4π) × (dl × r) / |r|³
    // Cross product: dl × r
    const crossX = seg.dl[1] * rz - seg.dl[2] * ry;
    const crossY = seg.dl[2] * rx - seg.dl[0] * rz;
    const crossZ = seg.dl[0] * ry - seg.dl[1] * rx;
    
    const factor = prefactor / r3;
    Bx += crossX * factor;
    By += crossY * factor;
    Bz += crossZ * factor;
  }
  
  return [Bx, By, Bz];
}

/**
 * Calculate B field on the axis of a circular coil (analytical formula for verification)
 * 
 * B_z(z) = μ₀ × N × I × R² / (2 × (R² + z²)^(3/2))
 * 
 * At z=0: B_z = μ₀NI/(2R)
 */
export function analyticalBzOnAxis(
  z: number,
  R: number,
  I: number,
  N: number = 1
): number {
  const R2 = R * R;
  const z2 = z * z;
  return (MU_0 * N * I * R2) / (2 * Math.pow(R2 + z2, 1.5));
}

/**
 * Calculate magnetic field on a 3D grid
 * Returns Float32Array with [Bx, By, Bz] for each grid point
 */
export function calculateFieldGrid(
  coils: CoilParams[],
  gridSize: number = 16,
  extent: number = 0.3, // half-width of the grid in meters
  segmentsPerTurn: number = 64
): {
  field: Float32Array;
  gridSize: number;
  extent: number;
  maxB: number;
} {
  const totalPoints = gridSize * gridSize * gridSize;
  const field = new Float32Array(totalPoints * 3);
  let maxB = 0;
  
  const step = (2 * extent) / (gridSize - 1);
  
  for (let iz = 0; iz < gridSize; iz++) {
    for (let iy = 0; iy < gridSize; iy++) {
      for (let ix = 0; ix < gridSize; ix++) {
        const x = -extent + ix * step;
        const y = -extent + iy * step;
        const z = -extent + iz * step;
        const point: Vec3 = [x, y, z];
        
        let Bx = 0, By = 0, Bz = 0;
        
        for (const coil of coils) {
          if (Math.abs(coil.current) < 1e-10) continue;
          const B = calculateBField(point, coil, segmentsPerTurn);
          Bx += B[0];
          By += B[1];
          Bz += B[2];
        }
        
        const idx = (iz * gridSize * gridSize + iy * gridSize + ix) * 3;
        field[idx] = Bx;
        field[idx + 1] = By;
        field[idx + 2] = Bz;
        
        const mag = Math.sqrt(Bx * Bx + By * By + Bz * Bz);
        if (mag > maxB) maxB = mag;
      }
    }
  }
  
  return { field, gridSize, extent, maxB };
}

/**
 * Calculate self-inductance of a single-layer solenoid
 * L = μ₀ × N² × A / l
 * where A = πR² is the cross-section area, l = N × pitch is the length
 * 
 * For a single circular loop: L ≈ μ₀R(ln(8R/a) - 2) where a is wire radius
 * Simplified: L ≈ μ₀πR (for thin wire approximation)
 */
export function calculateSelfInductance(
  R: number,
  N: number,
  pitch: number
): number {
  if (N <= 1) {
    // Single loop approximation: L = μ₀R(ln(8R/a) - 2)
    // Using a = R/100 as wire radius approximation
    const a = R / 100;
    return MU_0 * R * (Math.log(8 * R / a) - 2);
  }
  // Solenoid: L = μ₀N²πR²/l
  const length = N * pitch;
  if (length < 1e-10) return 0;
  const A = Math.PI * R * R;
  return MU_0 * N * N * A / length;
}

/**
 * Calculate mutual inductance between two coaxial coils using Neumann formula
 * M = (μ₀/4π) ∮∮ (dl₁ · dl₂) / |r₁₂|
 * 
 * For two coaxial circular loops of radii R1, R2 separated by distance d:
 * Uses numerical integration
 */
export function calculateMutualInductance(
  coil1: CoilParams,
  coil2: CoilParams,
  segmentsPerTurn: number = 64
): number {
  const segs1 = generateCoilSegments(coil1, segmentsPerTurn);
  const segs2 = generateCoilSegments(coil2, segmentsPerTurn);
  
  let M = 0;
  
  for (const s1 of segs1) {
    for (const s2 of segs2) {
      const rx = s2.pos[0] - s1.pos[0];
      const ry = s2.pos[1] - s1.pos[1];
      const rz = s2.pos[2] - s1.pos[2];
      const r = Math.sqrt(rx * rx + ry * ry + rz * rz);
      
      if (r < 1e-15) continue;
      
      // dl₁ · dl₂
      const dot = s1.dl[0] * s2.dl[0] + s1.dl[1] * s2.dl[1] + s1.dl[2] * s2.dl[2];
      M += dot / r;
    }
  }
  
  return MU_0_OVER_4PI * M;
}

/**
 * Calculate magnetic flux through a coil due to another coil's field
 * Φ = ∫∫ B · dA ≈ Σ B(sample_point) · n̂ × ΔA
 */
export function calculateFlux(
  sourceCoil: CoilParams,
  targetCoil: CoilParams,
  samplePoints: number = 20,
  segmentsPerTurn: number = 64
): number {
  const { radius, position, rotation } = targetCoil;
  let flux = 0;
  
  // Sample points across the target coil's area
  const cosRot = Math.cos(rotation);
  const sinRot = Math.sin(rotation);
  
  // Normal vector of target coil (z-axis rotated)
  const normal: Vec3 = [-sinRot, cosRot, 0]; // Simplified for rotation around z
  // Actually for a coil in xy-plane, normal is [0,0,1]
  // After rotation around z, it's still [0,0,1] (rotation around z doesn't change z-normal)
  const nVec: Vec3 = [0, 0, 1];
  
  const dr = radius / samplePoints;
  
  for (let ir = 0; ir < samplePoints; ir++) {
    const r = (ir + 0.5) * dr;
    const nTheta = Math.max(6, Math.floor(2 * Math.PI * r / dr));
    const dTheta = 2 * Math.PI / nTheta;
    const dA = r * dr * dTheta;
    
    for (let it = 0; it < nTheta; it++) {
      const theta = it * dTheta;
      const lx = r * Math.cos(theta);
      const ly = r * Math.sin(theta);
      
      // Apply rotation and translation
      const px = lx * cosRot - ly * sinRot + position[0];
      const py = lx * sinRot + ly * cosRot + position[1];
      const pz = position[2];
      
      const B = calculateBField([px, py, pz], sourceCoil, segmentsPerTurn);
      
      // Flux contribution: B · n̂ × dA
      flux += vecDot(B, nVec) * dA;
    }
  }
  
  return flux * targetCoil.turns;
}

/**
 * Verify Biot-Savart calculation against analytical formula
 * Test case: R=0.1m, I=1A, z = [-0.2, -0.1, 0, 0.1, 0.2]
 * Expected: B_z = μ₀IR²/(2(R²+z²)^(3/2))
 */
export function runVerification(): {
  testPoints: number[];
  numerical: number[];
  analytical: number[];
  errors: number[];
  passed: boolean;
} {
  const R = 0.1; // meters
  const I = 1.0; // amperes
  const testPoints = [-0.2, -0.1, 0, 0.1, 0.2];
  
  const coil: CoilParams = {
    radius: R,
    current: I,
    turns: 1,
    pitch: 0,
    position: [0, 0, 0],
    rotation: 0,
    direction: 1,
  };
  
  const numerical: number[] = [];
  const analytical: number[] = [];
  const errors: number[] = [];
  
  for (const z of testPoints) {
    const B = calculateBField([0, 0, z], coil, 128);
    const Bz_num = B[2];
    const Bz_ana = analyticalBzOnAxis(z, R, I);
    
    numerical.push(Bz_num);
    analytical.push(Bz_ana);
    
    const error = Bz_ana !== 0 
      ? Math.abs((Bz_num - Bz_ana) / Bz_ana) * 100 
      : Math.abs(Bz_num) * 100;
    errors.push(error);
  }
  
  const passed = errors.every(e => e < 1);
  
  return { testPoints, numerical, analytical, errors, passed };
}
