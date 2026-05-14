/**
 * Data Fitting Analysis Panel — Theme-aware
 * Canvas charts read CSS variables for colors
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import {
  DataPoint, FitResult, linearFit, polynomialFit, powerLawFit,
  detectOutliersZScore, detectOutliersIQR, generateExampleData, formatSci,
} from '@/lib/fitting';
import { Button } from '@/components/ui/button';
import {
  Plus, Trash2, Download, Upload, FlaskConical, AlertTriangle,
  CheckCircle2, BarChart3, Table, FileDown,
} from 'lucide-react';

type FitType = 'linear' | 'polynomial' | 'power';
type ExampleType = 'L_vs_N2' | 'L_vs_R2' | 'M_vs_d';

/** Read a CSS custom property from :root */
function getCSSVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export default function DataFittingPanel() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [data, setData] = useState<DataPoint[]>([]);
  const [fitType, setFitType] = useState<FitType>('power');
  const [polyDegree, setPolyDegree] = useState(2);
  const [useWeighted, setUseWeighted] = useState(false);
  const [outlierMethod, setOutlierMethod] = useState<'none' | 'zscore' | 'iqr'>('none');
  const [showResiduals, setShowResiduals] = useState(true);
  const [showLogLog, setShowLogLog] = useState(false);
  const [activeTab, setActiveTab] = useState<'data' | 'chart' | 'stats'>('chart');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const residualCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fitResult = useMemo<FitResult | null>(() => {
    const enabledData = data.filter(d => d.enabled);
    if (enabledData.length < 2) return null;
    try {
      switch (fitType) {
        case 'linear': return linearFit(data, useWeighted);
        case 'polynomial': return polynomialFit(data, polyDegree, useWeighted);
        case 'power': return powerLawFit(data, useWeighted);
        default: return null;
      }
    } catch { return null; }
  }, [data, fitType, polyDegree, useWeighted]);

  const outliers = useMemo(() => {
    if (!fitResult || outlierMethod === 'none') return data.map(() => false);
    if (outlierMethod === 'zscore') return detectOutliersZScore(data, fitResult);
    return detectOutliersIQR(data, fitResult);
  }, [data, fitResult, outlierMethod]);

  useEffect(() => { drawChart(); }, [data, fitResult, showLogLog, outliers, isDark]);
  useEffect(() => { if (showResiduals) drawResiduals(); }, [data, fitResult, showResiduals, outliers, isDark]);

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bgColor = getCSSVar('--lab-canvas-bg') || (isDark ? '#0a1628' : '#eef2f7');
    const gridColor = getCSSVar('--lab-canvas-grid') || 'rgba(0,0,0,0.1)';
    const axisColor = getCSSVar('--lab-canvas-axis') || 'rgba(0,0,0,0.3)';
    const textColor = getCSSVar('--lab-canvas-text') || '#333';
    const curveColor = getCSSVar('--lab-canvas-curve') || '#0e6f9e';
    const pointColor = getCSSVar('--lab-canvas-point') || '#b45309';
    const outlierColor = getCSSVar('--lab-canvas-outlier') || '#dc2626';

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;
    const pad = { top: 30, right: 20, bottom: 45, left: 65 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    const enabledData = data.filter(d => d.enabled);
    if (enabledData.length === 0) {
      ctx.fillStyle = textColor;
      ctx.font = '14px "IBM Plex Sans"';
      ctx.textAlign = 'center';
      ctx.fillText('请输入数据或加载示例数据集', w / 2, h / 2);
      return;
    }

    const xs = enabledData.map(d => showLogLog && d.x > 0 ? Math.log10(d.x) : d.x);
    const ys = enabledData.map(d => showLogLog && d.y > 0 ? Math.log10(d.y) : d.y);
    let xMin = Math.min(...xs), xMax = Math.max(...xs);
    let yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xPad = (xMax - xMin) * 0.1 || 1;
    const yPad = (yMax - yMin) * 0.1 || 1;
    xMin -= xPad; xMax += xPad; yMin -= yPad; yMax += yPad;
    const toPixelX = (x: number) => pad.left + ((x - xMin) / (xMax - xMin)) * plotW;
    const toPixelY = (y: number) => pad.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

    // Grid
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    const nGridX = 8, nGridY = 6;
    for (let i = 0; i <= nGridX; i++) {
      const px = toPixelX(xMin + (i / nGridX) * (xMax - xMin));
      ctx.beginPath(); ctx.moveTo(px, pad.top); ctx.lineTo(px, pad.top + plotH); ctx.stroke();
    }
    for (let i = 0; i <= nGridY; i++) {
      const py = toPixelY(yMin + (i / nGridY) * (yMax - yMin));
      ctx.beginPath(); ctx.moveTo(pad.left, py); ctx.lineTo(pad.left + plotW, py); ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + plotH);
    ctx.lineTo(pad.left + plotW, pad.top + plotH);
    ctx.stroke();

    // Labels
    ctx.fillStyle = textColor;
    ctx.font = '10px "JetBrains Mono"';
    ctx.textAlign = 'center';
    for (let i = 0; i <= nGridX; i++) {
      const x = xMin + (i / nGridX) * (xMax - xMin);
      ctx.fillText(x.toPrecision(3), toPixelX(x), pad.top + plotH + 15);
    }
    ctx.textAlign = 'right';
    for (let i = 0; i <= nGridY; i++) {
      const y = yMin + (i / nGridY) * (yMax - yMin);
      ctx.fillText(y.toPrecision(3), pad.left - 5, toPixelY(y) + 3);
    }

    ctx.fillStyle = textColor;
    ctx.font = '11px "IBM Plex Sans"';
    ctx.textAlign = 'center';
    ctx.fillText(showLogLog ? 'log\u2081\u2080(x)' : 'x', pad.left + plotW / 2, h - 5);
    ctx.save();
    ctx.translate(12, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(showLogLog ? 'log\u2081\u2080(y)' : 'y', 0, 0);
    ctx.restore();

    // Fit curve
    if (fitResult && fitResult.params.length > 0) {
      ctx.strokeStyle = curveColor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const origXs = enabledData.map(d => d.x);
      const curveXMin = Math.min(...origXs);
      const curveXMax = Math.max(...origXs);
      for (let i = 0; i <= 100; i++) {
        const t = i / 100;
        let xVal: number;
        if (showLogLog) {
          const logMin = Math.log10(Math.max(curveXMin, 1e-10));
          const logMax = Math.log10(curveXMax);
          xVal = Math.pow(10, logMin + t * (logMax - logMin));
        } else {
          xVal = curveXMin + t * (curveXMax - curveXMin);
        }
        let yVal = evaluateFit(fitResult, xVal);
        let px: number, py: number;
        if (showLogLog) {
          px = toPixelX(Math.log10(xVal));
          py = toPixelY(yVal > 0 ? Math.log10(yVal) : yMin);
        } else {
          px = toPixelX(xVal);
          py = toPixelY(yVal);
        }
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Data points
    enabledData.forEach((d, idx) => {
      const isOutlier = outliers[data.indexOf(d)];
      const px = toPixelX(showLogLog && d.x > 0 ? Math.log10(d.x) : d.x);
      const py = toPixelY(showLogLog && d.y > 0 ? Math.log10(d.y) : d.y);

      if (d.dy && d.dy > 0 && !showLogLog) {
        ctx.strokeStyle = isDark ? 'rgba(246,173,85,0.4)' : 'rgba(180,83,9,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px, toPixelY(d.y - d.dy)); ctx.lineTo(px, toPixelY(d.y + d.dy)); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px - 3, toPixelY(d.y - d.dy)); ctx.lineTo(px + 3, toPixelY(d.y - d.dy));
        ctx.moveTo(px - 3, toPixelY(d.y + d.dy)); ctx.lineTo(px + 3, toPixelY(d.y + d.dy));
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(px, py, isOutlier ? 5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isOutlier ? outlierColor : pointColor;
      ctx.fill();
      if (isOutlier) {
        ctx.strokeStyle = outlierColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px - 7, py - 7); ctx.lineTo(px + 7, py + 7);
        ctx.moveTo(px + 7, py - 7); ctx.lineTo(px - 7, py + 7);
        ctx.stroke();
      }
    });

    // Legend
    if (fitResult && fitResult.equation) {
      const legendText = `${fitResult.equation}  R\u00B2 = ${fitResult.rSquared.toFixed(4)}`;
      ctx.font = '11px "JetBrains Mono"';
      const textWidth = ctx.measureText(legendText).width;
      const lx = pad.left + 10, ly = pad.top + 5;
      ctx.fillStyle = isDark ? 'rgba(10,22,40,0.85)' : 'rgba(255,255,255,0.9)';
      ctx.strokeStyle = isDark ? 'rgba(79,209,197,0.3)' : 'rgba(14,111,158,0.25)';
      ctx.lineWidth = 1;
      ctx.fillRect(lx, ly, textWidth + 20, 24);
      ctx.strokeRect(lx, ly, textWidth + 20, 24);
      ctx.fillStyle = curveColor;
      ctx.textAlign = 'left';
      ctx.fillText(legendText, lx + 10, ly + 16);
    }
  }, [data, fitResult, showLogLog, outliers, isDark]);

  const drawResiduals = useCallback(() => {
    const canvas = residualCanvasRef.current;
    if (!canvas || !fitResult) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bgColor = getCSSVar('--lab-canvas-bg') || (isDark ? '#0a1628' : '#eef2f7');
    const axisColor = getCSSVar('--lab-canvas-axis') || 'rgba(0,0,0,0.3)';
    const textColor = getCSSVar('--lab-canvas-text') || '#333';
    const pointColor = getCSSVar('--lab-canvas-point') || '#b45309';
    const outlierColor = getCSSVar('--lab-canvas-outlier') || '#dc2626';
    const bandColor = getCSSVar('--lab-canvas-band') || 'rgba(0,0,0,0.04)';

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;
    const pad = { top: 10, right: 20, bottom: 30, left: 65 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    const enabledData = data.filter(d => d.enabled);
    if (enabledData.length === 0 || fitResult.residuals.length === 0) return;

    const residuals = fitResult.residuals;
    const xs = enabledData.map(d => d.x);
    const xMin = Math.min(...xs) - (Math.max(...xs) - Math.min(...xs)) * 0.1;
    const xMax = Math.max(...xs) + (Math.max(...xs) - Math.min(...xs)) * 0.1;
    const maxRes = Math.max(...residuals.map(Math.abs)) || 1;
    const yMin = -maxRes * 1.3, yMax = maxRes * 1.3;
    const toPixelX = (x: number) => pad.left + ((x - xMin) / (xMax - xMin)) * plotW;
    const toPixelY = (y: number) => pad.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

    const std = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length);
    for (const sigma of [3, 2, 1]) {
      ctx.fillStyle = bandColor;
      const y1 = toPixelY(sigma * std), y2 = toPixelY(-sigma * std);
      ctx.fillRect(pad.left, y1, plotW, y2 - y1);
    }

    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const zeroY = toPixelY(0);
    ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(pad.left + plotW, zeroY); ctx.stroke();
    ctx.setLineDash([]);

    enabledData.forEach((d, idx) => {
      if (idx >= residuals.length) return;
      const isOutlier = outliers[data.indexOf(d)];
      const px = toPixelX(d.x), py = toPixelY(residuals[idx]);
      ctx.strokeStyle = isOutlier ? outlierColor + '99' : pointColor + '66';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, zeroY); ctx.lineTo(px, py); ctx.stroke();
      ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fillStyle = isOutlier ? outlierColor : pointColor;
      ctx.fill();
    });

    ctx.fillStyle = textColor;
    ctx.font = '9px "JetBrains Mono"';
    ctx.textAlign = 'center';
    ctx.fillText('残差图', pad.left + plotW / 2, h - 5);
  }, [data, fitResult, showResiduals, outliers, isDark]);

  const loadExample = (type: ExampleType) => {
    setData(generateExampleData(type));
    setFitType('power');
    if (type === 'L_vs_N2' || type === 'L_vs_R2') setShowLogLog(true);
  };

  const addRow = () => setData(prev => [...prev, { x: 0, y: 0, enabled: true }]);
  const updatePoint = (index: number, field: keyof DataPoint, value: number | boolean) => {
    setData(prev => prev.map((d, i) => i === index ? { ...d, [field]: value } : d));
  };
  const removePoint = (index: number) => setData(prev => prev.filter((_, i) => i !== index));

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.trim().split('\n');
      const newData: DataPoint[] = [];
      for (const line of lines) {
        const parts = line.split(/[,\t]/).map(s => s.trim());
        if (parts.length >= 2) {
          const x = parseFloat(parts[0]), y = parseFloat(parts[1]);
          const dy = parts.length >= 3 ? parseFloat(parts[2]) : undefined;
          if (!isNaN(x) && !isNaN(y)) newData.push({ x, y, dy: dy && !isNaN(dy) ? dy : undefined, enabled: true });
        }
      }
      if (newData.length > 0) setData(newData);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const exportCSV = () => {
    const enabledData = data.filter(d => d.enabled);
    let csv = 'x,y';
    if (enabledData.some(d => d.dy !== undefined)) csv += ',dy';
    if (fitResult) csv += ',y_fit,residual';
    csv += '\n';
    enabledData.forEach((d, i) => {
      let line = `${d.x},${d.y}`;
      if (enabledData.some(d => d.dy !== undefined)) line += `,${d.dy || ''}`;
      if (fitResult && i < fitResult.fittedValues.length) line += `,${fitResult.fittedValues[i]},${fitResult.residuals[i]}`;
      csv += line + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'fitting_data.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = 'fitting_chart.png'; a.click();
  };

  const selectStyle: React.CSSProperties = {
    height: 28, fontSize: '0.75rem',
    background: isDark ? '#0d1f35' : '#fff',
    border: '1px solid var(--lab-panel-border)',
    color: 'var(--lab-primary-text)',
    borderRadius: 4, padding: '0 0.5rem',
  };

  const exampleBtnStyle: React.CSSProperties = {
    height: 28, fontSize: '0.75rem',
    border: '1px solid var(--lab-panel-border)',
    color: 'var(--lab-primary-text)',
    background: 'var(--lab-primary-soft)',
    borderRadius: 4, padding: '0 0.5rem',
    fontWeight: 500,
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b flex-wrap" style={{ borderColor: 'var(--lab-panel-border)' }}>
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-mono uppercase tracking-wider t-muted-soft">示例</span>
          {(['L_vs_N2', 'L_vs_R2', 'M_vs_d'] as ExampleType[]).map(type => (
            <button key={type} style={exampleBtnStyle} onClick={() => loadExample(type)}>
              {type === 'L_vs_N2' ? 'L vs N²' : type === 'L_vs_R2' ? 'L vs R²' : 'M vs d'}
            </button>
          ))}
        </div>
        <div className="h-4 w-px" style={{ background: 'var(--lab-panel-border)' }} />
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-mono uppercase tracking-wider t-muted-soft">拟合</span>
          <select value={fitType} onChange={e => setFitType(e.target.value as FitType)} style={selectStyle}>
            <option value="linear">线性</option>
            <option value="polynomial">多项式</option>
            <option value="power">幂律</option>
          </select>
          {fitType === 'polynomial' && (
            <select value={polyDegree} onChange={e => setPolyDegree(parseInt(e.target.value))} style={{ ...selectStyle, width: 64 }}>
              {[1, 2, 3, 4, 5].map(d => <option key={d} value={d}>{d}次</option>)}
            </select>
          )}
        </div>
        <div className="h-4 w-px" style={{ background: 'var(--lab-panel-border)' }} />
        <div className="flex items-center gap-2">
          {[
            { label: 'log-log', checked: showLogLog, onChange: setShowLogLog },
            { label: '残差', checked: showResiduals, onChange: setShowResiduals },
            { label: '加权', checked: useWeighted, onChange: setUseWeighted },
          ].map(opt => (
            <label key={opt.label} className="flex items-center gap-1 text-xs cursor-pointer t-muted">
              <input type="checkbox" checked={opt.checked} onChange={e => opt.onChange(e.target.checked)} />
              {opt.label}
            </label>
          ))}
        </div>
        <div className="h-4 w-px" style={{ background: 'var(--lab-panel-border)' }} />
        <select value={outlierMethod} onChange={e => setOutlierMethod(e.target.value as any)} style={selectStyle}>
          <option value="none">无异常检测</option>
          <option value="zscore">Z-score (±3σ)</option>
          <option value="iqr">IQR 法</option>
        </select>
      </div>

      {/* Tab switcher */}
      <div className="flex border-b" style={{ borderColor: 'var(--lab-panel-border)' }}>
        {([
          { key: 'chart' as const, label: '图表', icon: BarChart3 },
          { key: 'data' as const, label: '数据', icon: Table },
          { key: 'stats' as const, label: '统计', icon: FlaskConical },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-mono uppercase tracking-wider transition-colors"
            style={{
              borderBottom: activeTab === tab.key ? '2px solid var(--lab-primary)' : '2px solid transparent',
              color: activeTab === tab.key ? 'var(--lab-primary-text)' : 'var(--lab-muted-soft)',
              fontWeight: activeTab === tab.key ? 600 : 400,
            }}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 pr-2">
          <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleCSVImport} className="hidden" />
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 t-muted" onClick={() => fileInputRef.current?.click()} title="导入 CSV"><Upload size={14} /></Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 t-muted" onClick={exportCSV} title="导出 CSV"><FileDown size={14} /></Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 t-muted" onClick={exportPNG} title="导出 PNG"><Download size={14} /></Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'chart' && (
          <div className="p-3 space-y-2 h-full flex flex-col">
            <div className="flex-1 min-h-[200px]">
              <canvas ref={canvasRef} className="w-full h-full rounded" style={{ border: '1px solid var(--lab-panel-border)', minHeight: 200 }} />
            </div>
            {showResiduals && fitResult && (
              <div className="h-[120px] shrink-0">
                <canvas ref={residualCanvasRef} className="w-full h-full rounded" style={{ border: '1px solid var(--lab-panel-border)' }} />
              </div>
            )}
          </div>
        )}

        {activeTab === 'data' && (
          <div className="p-3">
            <div className="overflow-auto max-h-[400px]">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr style={{ color: 'var(--lab-muted)', borderBottom: '1px solid var(--lab-panel-border)' }}>
                    <th className="py-1.5 px-2 text-left w-8">#</th>
                    <th className="py-1.5 px-2 text-left">x</th>
                    <th className="py-1.5 px-2 text-left">y</th>
                    <th className="py-1.5 px-2 text-left">Δy</th>
                    <th className="py-1.5 px-2 text-center w-12">启用</th>
                    <th className="py-1.5 px-2 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((d, i) => (
                    <tr key={i} style={{
                      borderBottom: '1px solid var(--lab-panel-border)',
                      opacity: d.enabled ? 1 : 0.4,
                      background: outliers[i] ? (isDark ? 'rgba(252,129,129,0.08)' : 'rgba(220,38,38,0.06)') : 'transparent',
                    }}>
                      <td className="py-1 px-2 t-muted-soft">{i + 1}</td>
                      <td className="py-1 px-2">
                        <input type="number" value={d.x} onChange={e => updatePoint(i, 'x', parseFloat(e.target.value) || 0)}
                          className="w-full bg-transparent outline-none px-1" style={{ borderBottom: '1px solid var(--lab-panel-border)', color: 'var(--lab-value-text)' }} step="any" />
                      </td>
                      <td className="py-1 px-2">
                        <input type="number" value={d.y} onChange={e => updatePoint(i, 'y', parseFloat(e.target.value) || 0)}
                          className="w-full bg-transparent outline-none px-1" style={{ borderBottom: '1px solid var(--lab-panel-border)', color: 'var(--lab-value-text)' }} step="any" />
                      </td>
                      <td className="py-1 px-2">
                        <input type="number" value={d.dy || ''} onChange={e => updatePoint(i, 'dy', parseFloat(e.target.value) || 0)} placeholder="—"
                          className="w-full bg-transparent outline-none px-1" style={{ borderBottom: '1px solid var(--lab-panel-border)', color: 'var(--lab-secondary)' }} step="any" />
                      </td>
                      <td className="py-1 px-2 text-center">
                        <input type="checkbox" checked={d.enabled} onChange={e => updatePoint(i, 'enabled', e.target.checked)} />
                      </td>
                      <td className="py-1 px-2 text-center">
                        <button onClick={() => removePoint(i)} className="t-danger opacity-50 hover:opacity-100"><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={addRow}>
              <Plus size={12} className="mr-1" /> 添加数据点
            </Button>
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="p-3 space-y-3">
            {fitResult ? (
              <>
                <div className="panel rounded p-3">
                  <div className="text-[10px] font-mono uppercase tracking-wider t-muted-soft mb-1">拟合方程</div>
                  <div className="led-display text-sm">{fitResult.equation}</div>
                </div>
                <div className="panel rounded p-3">
                  <div className="text-[10px] font-mono uppercase tracking-wider t-muted-soft mb-1">拟合优度</div>
                  <div className="led-display text-lg">R² = {fitResult.rSquared.toFixed(6)}</div>
                  <div className="mt-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--lab-primary-soft)' }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{
                      width: `${fitResult.rSquared * 100}%`,
                      background: fitResult.rSquared > 0.99 ? 'var(--lab-success)' : fitResult.rSquared > 0.95 ? 'var(--lab-primary)' : 'var(--lab-secondary)',
                    }} />
                  </div>
                </div>
                <div className="panel rounded overflow-hidden">
                  <div className="panel-header">参数估计</div>
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr style={{ color: 'var(--lab-muted)', borderBottom: '1px solid var(--lab-panel-border)' }}>
                        <th className="py-1.5 px-3 text-left">参数</th>
                        <th className="py-1.5 px-3 text-right">估计值</th>
                        <th className="py-1.5 px-3 text-right">标准误差</th>
                        <th className="py-1.5 px-3 text-right">95% CI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fitResult.paramNames.map((name, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--lab-panel-border)' }}>
                          <td className="py-1.5 px-3 t-primary">{name}</td>
                          <td className="py-1.5 px-3 text-right" style={{ color: 'var(--lab-value-text)' }}>{formatSci(fitResult.params[i])}</td>
                          <td className="py-1.5 px-3 text-right t-secondary">±{formatSci(fitResult.paramErrors[i])}</td>
                          <td className="py-1.5 px-3 text-right t-muted">[{formatSci(fitResult.ci95[i]?.[0] || 0)}, {formatSci(fitResult.ci95[i]?.[1] || 0)}]</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="panel rounded p-3 space-y-2">
                  <div className="panel-header !border-0 !p-0 !pb-2">教学反馈</div>
                  {fitResult.rSquared > 0.99 && (
                    <div className="flex items-start gap-2 text-xs t-success">
                      <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                      <span>拟合优度极高 (R² {'>'} 0.99)，数据与模型高度一致。</span>
                    </div>
                  )}
                  {fitResult.type === 'power' && fitResult.params[1] !== undefined && (
                    <div className="flex items-start gap-2 text-xs t-primary">
                      <FlaskConical size={14} className="mt-0.5 shrink-0" />
                      <span>
                        幂律指数 b = {fitResult.params[1].toFixed(3)} ± {fitResult.paramErrors[1]?.toFixed(3)}
                        {Math.abs(fitResult.params[1] - 2) < 0.15 && '，与理论值 b=2 一致（L∝N² 或 L∝R²）'}
                        {Math.abs(fitResult.params[1] + 3) < 0.3 && '，与理论值 b≈-3 一致（M∝d⁻³）'}
                      </span>
                    </div>
                  )}
                  {fitResult.warning && (
                    <div className="flex items-start gap-2 text-xs t-secondary">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      <span>{fitResult.warning}</span>
                    </div>
                  )}
                  {outliers.some(o => o) && (
                    <div className="flex items-start gap-2 text-xs t-danger">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      <span>检测到 {outliers.filter(o => o).length} 个异常点（已在图中标记）</span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-sm t-muted-soft">请先输入数据并选择拟合方法</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function evaluateFit(fit: FitResult, x: number): number {
  switch (fit.type) {
    case 'linear': return fit.params[0] * x + fit.params[1];
    case 'polynomial': {
      let y = 0, xPow = 1;
      for (let i = 0; i < fit.params.length; i++) { y += fit.params[i] * xPow; xPow *= x; }
      return y;
    }
    case 'power': return fit.params[0] * Math.pow(x, fit.params[1]);
    default: return 0;
  }
}
