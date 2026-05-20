/**
 * Control Panel Component — Theme-aware
 * All colors use CSS custom properties (--lab-*)
 */

import { useState } from 'react';
import { CoilParams, DEFAULT_COIL } from '@/lib/physics';
import { PhysicsData } from '@/components/MagneticFieldViewer';
import {
  ChevronDown,
  ChevronRight,
  Zap,
  Circle,
  Layers,
  Eye,
  Settings,
  RotateCcw,
} from 'lucide-react';
import { formatSci } from '@/lib/fitting';

interface ControlPanelProps {
  coil1: CoilParams;
  coil2: CoilParams | null;
  dualMode: boolean;
  gridSize: number;
  showFieldArrows: boolean;
  showFieldLines: boolean;
  fieldThreshold: number;
  fieldLineWidth: number;
  fieldLineDensity: number;
  physicsData: PhysicsData | null;
  onCoil1Change: (coil: CoilParams) => void;
  onCoil2Change: (coil: CoilParams | null) => void;
  onDualModeChange: (dual: boolean) => void;
  onGridSizeChange: (size: number) => void;
  onShowFieldArrowsChange: (show: boolean) => void;
  onShowFieldLinesChange: (show: boolean) => void;
  onFieldThresholdChange: (threshold: number) => void;
  onFieldLineWidthChange: (width: number) => void;
  onFieldLineDensityChange: (density: number) => void;
  onReset: () => void;
}

function Section({ title, icon, defaultOpen = true, children }: {
  title: string; icon: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-lab">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-mono uppercase tracking-wider transition-colors t-primary"
        style={{ fontWeight: 600 }}
      >
        {icon}
        <span className="flex-1 text-left">{title}</span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && <div className="px-3 pb-3 space-y-2.5">{children}</div>}
    </div>
  );
}

function SliderRow({ label, value, min, max, step, unit, tooltip, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string; tooltip?: string; onChange: (val: number) => void;
}) {
  return (
    <div className="space-y-0.5" title={tooltip}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] t-muted-soft">{label}</span>
        <span className="text-[11px] font-mono" style={{ color: 'var(--lab-value-text)' }}>
          {value < 0.001 ? value.toExponential(2) : value.toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0)}
          <span className="t-muted-soft ml-0.5">{unit}</span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="lab-slider"
      />
    </div>
  );
}

export default function ControlPanel({
  coil1, coil2, dualMode, gridSize, showFieldArrows, showFieldLines,
  fieldThreshold, fieldLineWidth, fieldLineDensity, physicsData, onCoil1Change, onCoil2Change,
  onDualModeChange, onGridSizeChange, onShowFieldArrowsChange,
  onShowFieldLinesChange, onFieldThresholdChange, onFieldLineWidthChange,
  onFieldLineDensityChange, onReset,
}: ControlPanelProps) {
  const updateCoil1 = (field: keyof CoilParams, value: number) => {
    onCoil1Change({ ...coil1, [field]: value });
  };
  const updateCoil2 = (field: keyof CoilParams, value: number) => {
    if (!coil2) return;
    onCoil2Change({ ...coil2, [field]: value });
  };

  const modeBtn = (active: boolean) => ({
    background: active ? 'var(--lab-primary-soft)' : 'transparent',
    border: `1px solid ${active ? 'var(--lab-primary)' : 'var(--lab-panel-border)'}`,
    color: active ? 'var(--lab-primary-text)' : 'var(--lab-muted-soft)',
    fontWeight: active ? 600 : 400,
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="panel-header flex items-center justify-between">
        <span>控制面板</span>
        <button onClick={onReset} className="t-muted hover:t-primary transition-colors" title="重置参数">
          <RotateCcw size={12} />
        </button>
      </div>

      <Section title="模式" icon={<Layers size={12} />}>
        <div className="flex gap-2">
          <button
            onClick={() => onDualModeChange(false)}
            className="flex-1 py-1.5 text-[10px] font-mono rounded transition-all"
            style={modeBtn(!dualMode)}
          >
            单线圈
          </button>
          <button
            onClick={() => {
              onDualModeChange(true);
              if (!coil2) onCoil2Change({ ...DEFAULT_COIL, position: [0, 0, 0.15] });
            }}
            className="flex-1 py-1.5 text-[10px] font-mono rounded transition-all"
            style={modeBtn(dualMode)}
          >
            双线圈
          </button>
        </div>
      </Section>

      <Section title="线圈 1" icon={<Circle size={12} />}>
        <SliderRow label="半径 R" value={coil1.radius} min={0.02} max={0.5} step={0.01} unit="m" tooltip="线圈半径，影响自感 L ∝ R²" onChange={v => updateCoil1('radius', v)} />
        <SliderRow label="电流 I" value={coil1.current} min={0} max={10} step={0.1} unit="A" tooltip="通过线圈的电流强度" onChange={v => updateCoil1('current', v)} />
        <SliderRow label="匝数 N" value={coil1.turns} min={1} max={100} step={1} unit="" tooltip="线圈匝数，影响自感 L ∝ N²" onChange={v => updateCoil1('turns', v)} />
        {coil1.turns > 1 && (
          <SliderRow label="圈距" value={coil1.pitch} min={0.001} max={0.05} step={0.001} unit="m" tooltip="相邻匝之间的距离" onChange={v => updateCoil1('pitch', v)} />
        )}
        <div className="flex items-center gap-2">
          <span className="text-[10px] t-muted-soft">绕线方向</span>
          <button
            onClick={() => onCoil1Change({ ...coil1, direction: coil1.direction === 1 ? -1 : 1 })}
            className="text-[10px] font-mono px-2 py-0.5 rounded transition-colors"
            style={{ border: '1px solid var(--lab-panel-border)', color: 'var(--lab-primary-text)' }}
          >
            {coil1.direction === 1 ? 'CCW ↺' : 'CW ↻'}
          </button>
        </div>
      </Section>

      {dualMode && coil2 && (
        <Section title="线圈 2" icon={<Circle size={12} />}>
          <SliderRow label="半径 R" value={coil2.radius} min={0.02} max={0.5} step={0.01} unit="m" onChange={v => updateCoil2('radius', v)} />
          <SliderRow label="电流 I" value={coil2.current} min={0} max={10} step={0.1} unit="A" onChange={v => updateCoil2('current', v)} />
          <SliderRow label="匝数 N" value={coil2.turns} min={1} max={100} step={1} unit="" onChange={v => updateCoil2('turns', v)} />
          <SliderRow label="z 位置" value={coil2.position[2]} min={-0.5} max={0.5} step={0.01} unit="m" tooltip="线圈2沿z轴的位置" onChange={v => onCoil2Change({ ...coil2, position: [0, 0, v] })} />
          <SliderRow label="旋转角" value={(coil2.rotation * 180) / Math.PI} min={0} max={360} step={5} unit="°" onChange={v => updateCoil2('rotation', (v * Math.PI) / 180)} />
          <div className="flex items-center gap-2">
            <span className="text-[10px] t-muted-soft">绕线方向</span>
            <button
              onClick={() => onCoil2Change({ ...coil2, direction: coil2.direction === 1 ? -1 : 1 })}
              className="text-[10px] font-mono px-2 py-0.5 rounded transition-colors"
              style={{ border: '1px solid var(--lab-panel-border)', color: 'var(--lab-primary-text)' }}
            >
              {coil2.direction === 1 ? 'CCW ↺' : 'CW ↻'}
            </button>
          </div>
        </Section>
      )}

      <Section title="显示选项" icon={<Eye size={12} />}>
        <label className="flex items-center gap-2 text-[10px] cursor-pointer t-muted">
          <input type="checkbox" checked={showFieldArrows} onChange={e => onShowFieldArrowsChange(e.target.checked)} className="accent-[var(--lab-primary)]" />
          磁感线箭头
        </label>
        <label className="flex items-center gap-2 text-[10px] cursor-pointer t-muted">
          <input type="checkbox" checked={showFieldLines} onChange={e => onShowFieldLinesChange(e.target.checked)} className="accent-[var(--lab-primary)]" />
          磁力线追踪
        </label>
        <SliderRow label="显示阈值" value={fieldThreshold} min={0} max={0.5} step={0.01} unit="" tooltip="仅显示 |B| > 阈值×max|B| 的箭头" onChange={onFieldThresholdChange} />
        <SliderRow label="磁力线粗细" value={fieldLineWidth} min={1.2} max={3.5} step={0.1} unit="px" tooltip="磁力线屏幕宽度，最大值为当前粗线效果" onChange={onFieldLineWidthChange} />
        <SliderRow label="磁力线密度" value={fieldLineDensity} min={0.5} max={2} step={0.1} unit="×" tooltip="磁力线数量倍率，最大约为当前默认数量的两倍" onChange={onFieldLineDensityChange} />
        <div className="space-y-0.5">
          <span className="text-[10px] t-muted-soft">分辨率</span>
          <div className="flex gap-1">
            {[
              { label: '低 8³', value: 8 },
              { label: '中 12³', value: 12 },
              { label: '高 16³', value: 16 },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => onGridSizeChange(opt.value)}
                className="flex-1 py-1 text-[9px] font-mono rounded transition-all"
                style={modeBtn(gridSize === opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="物理量" icon={<Zap size={12} />} defaultOpen={true}>
        <div className="space-y-2">
          <ReadoutRow label="自感 L₁" value={physicsData?.L1} unit="H" tooltip="L = μ₀N²πR²/l" />
          {dualMode && (
            <>
              <ReadoutRow label="自感 L₂" value={physicsData?.L2} unit="H" />
              <ReadoutRow label="互感 M" value={physicsData?.M} unit="H" tooltip="M = Φ₂₁/I₁" />
              <ReadoutRow label="磁通 Φ" value={physicsData?.flux} unit="Wb" />
              <ReadoutRow label="耦合系数 k" value={physicsData?.k} unit="" tooltip="k = M/√(L₁L₂)" isRatio />
            </>
          )}
          <ReadoutRow label="最大 |B|" value={physicsData?.maxB} unit="T" />
        </div>
      </Section>

      <Section title="快速实验" icon={<Settings size={12} />} defaultOpen={false}>
        <div className="space-y-1.5">
          {[
            { label: '→ 单线圈基础：R=0.1m, I=1A', action: () => { onCoil1Change({ ...DEFAULT_COIL, radius: 0.1, current: 1, turns: 1 }); onDualModeChange(false); } },
            { label: '→ 螺线管：N=20, R=0.05m, I=2A', action: () => { onCoil1Change({ ...DEFAULT_COIL, radius: 0.05, current: 2, turns: 20, pitch: 0.005 }); onDualModeChange(false); } },
            { label: '→ 双线圈互感：d=0.2m', action: () => { onCoil1Change({ ...DEFAULT_COIL, radius: 0.1, current: 1, turns: 10, pitch: 0.005 }); onDualModeChange(true); onCoil2Change({ ...DEFAULT_COIL, radius: 0.1, current: 0, turns: 10, pitch: 0.005, position: [0, 0, 0.2] }); } },
            { label: '→ 密绕螺线管：N=50, I=5A', action: () => { onCoil1Change({ ...DEFAULT_COIL, radius: 0.1, current: 5, turns: 50, pitch: 0.003 }); onDualModeChange(false); } },
          ].map((exp, i) => (
            <button
              key={i}
              className="w-full text-left text-[10px] font-mono px-2 py-1.5 rounded transition-colors"
              style={{ border: '1px solid var(--lab-panel-border)', color: 'var(--lab-muted)' }}
              onClick={exp.action}
            >
              {exp.label}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

function ReadoutRow({ label, value, unit, tooltip, isRatio }: {
  label: string; value: number | undefined; unit: string; tooltip?: string; isRatio?: boolean;
}) {
  const displayValue = value !== undefined ? (isRatio ? value.toFixed(4) : formatSci(value)) : '—';
  return (
    <div className="flex items-center justify-between" title={tooltip}>
      <span className="text-[10px] t-muted-soft">{label}</span>
      <span className="led-display text-[11px]">
        {displayValue}
        {unit && <span className="t-muted-soft ml-1">{unit}</span>}
      </span>
    </div>
  );
}
