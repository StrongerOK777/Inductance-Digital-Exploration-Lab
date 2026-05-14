/**
 * Font Size Control — Dropdown for global text scaling
 * Only visible in light (projector) mode
 */

import { useFontSize } from '@/contexts/FontSizeContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Type } from 'lucide-react';

export default function FontSizeControl() {
  const { theme } = useTheme();
  const { scale, setScale } = useFontSize();
  
  // Only show in light mode (projector mode)
  if (theme !== 'light') return null;

  const options = [
    { value: 1.0 as const, label: '标准 100%' },
    { value: 1.2 as const, label: '放大 120%' },
    { value: 1.4 as const, label: '放大 140%' },
    { value: 1.6 as const, label: '放大 160%' },
  ];

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded" style={{
      background: 'var(--lab-primary-soft)',
      border: '1px solid var(--lab-panel-border)',
    }}>
      <Type size={14} style={{ color: 'var(--lab-primary)' }} />
      <select
        value={scale}
        onChange={e => setScale(parseFloat(e.target.value) as any)}
        className="bg-transparent text-xs font-mono outline-none cursor-pointer"
        style={{
          color: 'var(--lab-primary-text)',
          fontWeight: 500,
        }}
        title="投影仪模式 - 字号放大"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
