/**
 * Home Page - 自感与互感数字探究平台
 * 
 * Theme-aware: all colors use CSS custom properties (--lab-*)
 * Supports dark (graphite) and light (projector) modes
 */

import { useState, useCallback, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { CoilParams, DEFAULT_COIL } from '@/lib/physics';
import MagneticFieldViewer, { PhysicsData } from '@/components/MagneticFieldViewer';
import ControlPanel from '@/components/ControlPanel';
import DataFittingPanel from '@/components/DataFittingPanel';
import LearningResources from '@/components/LearningResources';
import VerificationPanel from '@/components/VerificationPanel';
import FontSizeControl from '@/components/FontSizeControl';
import {
  Box,
  BarChart3,
  BookOpen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Info,
  Zap,
  Sun,
  Moon,
} from 'lucide-react';

type TabKey = 'visualization' | 'analysis' | 'learning';

const HERO_IMAGE = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663635629048/APFVauPXdFw4atishT37nZ/hero-magnetic-field-LMcFCFWc22SE6FmH6vbLSC.webp';

export default function Home() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const [activeTab, setActiveTab] = useState<TabKey>('visualization');
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [showWelcome, setShowWelcome] = useState(true);

  // Coil state
  const [coil1, setCoil1] = useState<CoilParams>({
    ...DEFAULT_COIL,
    radius: 0.1,
    current: 1,
    turns: 1,
  });
  const [coil2, setCoil2] = useState<CoilParams | null>(null);
  const [dualMode, setDualMode] = useState(false);

  // Display state
  const [gridSize, setGridSize] = useState(12);
  const [showFieldArrows, setShowFieldArrows] = useState(true);
  const [showFieldLines, setShowFieldLines] = useState(false);
  const [fieldThreshold, setFieldThreshold] = useState(0.05);
  const [fieldLineWidth, setFieldLineWidth] = useState(3.5);
  const [fieldLineDensity, setFieldLineDensity] = useState(24);

  // Physics data from 3D viewer
  const [physicsData, setPhysicsData] = useState<PhysicsData | null>(null);

  // Responsive
  useEffect(() => {
    const checkMobile = () => {
      if (window.innerWidth < 768) {
        setLeftPanelOpen(false);
        setRightPanelOpen(false);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleReset = useCallback(() => {
    setCoil1({ ...DEFAULT_COIL, radius: 0.1, current: 1, turns: 1 });
    setCoil2(null);
    setDualMode(false);
    setGridSize(12);
    setShowFieldArrows(true);
    setShowFieldLines(false);
    setFieldThreshold(0.05);
    setFieldLineWidth(3.5);
    setFieldLineDensity(24);
  }, []);

  const handleDualModeChange = useCallback((dual: boolean) => {
    setDualMode(dual);
    if (!dual) setCoil2(null);
  }, []);

  const tabs = [
    { key: 'visualization' as TabKey, label: '3D 可视化', icon: Box },
    { key: 'analysis' as TabKey, label: '数据分析', icon: BarChart3 },
    { key: 'learning' as TabKey, label: '学习资源', icon: BookOpen },
  ];

  return (
    <div className="h-screen flex flex-col overflow-hidden lab-grid-fine" style={{ backgroundColor: 'var(--lab-bg)' }}>
      {/* Welcome overlay */}
      {showWelcome && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
          style={{ backgroundColor: isDark ? 'rgba(25,26,27,0.92)' : 'rgba(0,0,0,0.4)' }}
        >
          <div className="max-w-2xl w-full mx-4 panel rounded-lg overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="relative h-48 overflow-hidden">
              <img src={HERO_IMAGE} alt="磁场可视化" className="w-full h-full object-cover" />
              <div
                className="absolute inset-0"
                style={{ background: `linear-gradient(to top, var(--lab-bg), transparent)` }}
              />
              <div className="absolute bottom-4 left-6">
                <h1 className="text-2xl font-bold text-white" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                  自感与互感数字探究平台
                </h1>
                <p className="text-sm mt-1" style={{ color: isDark ? 'rgba(232,232,232,0.82)' : 'rgba(255,255,255,0.85)' }}>
                  Inductance Digital Exploration Lab
                </p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm leading-relaxed t-muted">
                欢迎使用自感与互感数字探究平台。本平台基于 Biot-Savart 定律，
                提供 3D 磁场可视化、数据拟合分析和交互式学习工具，
                帮助您深入理解电磁感应的物理本质。
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div className="panel rounded p-3 text-center">
                  <Box size={20} className="mx-auto mb-1 t-primary" />
                  <div className="text-[10px] font-mono t-muted-soft">3D 磁场</div>
                </div>
                <div className="panel rounded p-3 text-center">
                  <BarChart3 size={20} className="mx-auto mb-1 t-secondary" />
                  <div className="text-[10px] font-mono t-muted-soft">数据拟合</div>
                </div>
                <div className="panel rounded p-3 text-center">
                  <BookOpen size={20} className="mx-auto mb-1 t-success" />
                  <div className="text-[10px] font-mono t-muted-soft">学习资源</div>
                </div>
              </div>
              <button
                onClick={() => setShowWelcome(false)}
                className="w-full py-2.5 rounded text-sm font-mono uppercase tracking-wider transition-colors glow-neutral"
                style={{
                  background: 'var(--lab-primary-soft)',
                  border: '1px solid var(--lab-panel-border)',
                  color: 'var(--lab-primary-text)',
                }}
              >
                开始探索
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Navigation */}
      <header
        className="h-12 shrink-0 flex items-center border-b backdrop-blur-sm z-40"
        style={{
          background: 'var(--lab-header-bg)',
          borderColor: 'var(--lab-panel-border)',
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-2 px-4 border-r h-full"
          style={{ borderColor: 'var(--lab-panel-border)' }}
        >
          <div
            className="w-6 h-6 rounded flex items-center justify-center"
            style={{ background: 'var(--lab-primary-soft)', border: '1px solid var(--lab-panel-border)' }}
          >
            <Zap size={14} className="t-primary" strokeWidth={2} />
          </div>
          <span className="text-xs font-mono tracking-wider hidden sm:block t-primary" style={{ fontWeight: 600 }}>
            INDUCTANCE LAB
          </span>
        </div>

        {/* Tabs */}
        <nav className="flex items-center h-full">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex items-center gap-1.5 px-4 h-full text-xs font-mono uppercase tracking-wider transition-colors border-b-2"
              style={{
                borderColor: activeTab === tab.key ? 'var(--lab-primary)' : 'transparent',
                color: activeTab === tab.key ? 'var(--lab-primary-text)' : 'var(--lab-muted-soft)',
                background: activeTab === tab.key ? 'var(--lab-primary-soft)' : 'transparent',
                fontWeight: activeTab === tab.key ? 600 : 400,
              }}
            >
              <tab.icon size={14} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Right controls */}
        <div className="ml-auto flex items-center gap-1 px-3">
          <FontSizeControl />
          {activeTab === 'visualization' && (
            <>
              <button
                onClick={() => setLeftPanelOpen(!leftPanelOpen)}
                className="p-1.5 transition-colors t-muted hover:t-primary"
                title={leftPanelOpen ? '收起控制面板' : '展开控制面板'}
              >
                {leftPanelOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
              </button>
              <button
                onClick={() => setRightPanelOpen(!rightPanelOpen)}
                className="p-1.5 transition-colors t-muted hover:t-primary"
                title={rightPanelOpen ? '收起数据面板' : '展开数据面板'}
              >
                {rightPanelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
              </button>
            </>
          )}
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded transition-all"
            style={{
              color: 'var(--lab-primary-text)',
              background: 'var(--lab-primary-soft)',
              border: '1px solid var(--lab-panel-border)',
            }}
            title={isDark ? '切换到浅色模式（投影仪）' : '切换到深色模式'}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button
            onClick={() => setShowWelcome(true)}
            className="p-1.5 transition-colors t-muted"
            title="关于"
          >
            <Info size={16} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Controls */}
        {activeTab === 'visualization' && leftPanelOpen && (
          <aside
            className="w-64 shrink-0 border-r overflow-hidden"
            style={{ borderColor: 'var(--lab-panel-border)', background: 'var(--lab-aside-bg)' }}
          >
            <ControlPanel
              coil1={coil1}
              coil2={coil2}
              dualMode={dualMode}
              gridSize={gridSize}
              showFieldArrows={showFieldArrows}
              showFieldLines={showFieldLines}
              fieldThreshold={fieldThreshold}
              fieldLineWidth={fieldLineWidth}
              fieldLineDensity={fieldLineDensity}
              physicsData={physicsData}
              onCoil1Change={setCoil1}
              onCoil2Change={setCoil2}
              onDualModeChange={handleDualModeChange}
              onGridSizeChange={setGridSize}
              onShowFieldArrowsChange={setShowFieldArrows}
              onShowFieldLinesChange={setShowFieldLines}
              onFieldThresholdChange={setFieldThreshold}
              onFieldLineWidthChange={setFieldLineWidth}
              onFieldLineDensityChange={setFieldLineDensity}
              onReset={handleReset}
            />
          </aside>
        )}

        {/* Center Content */}
        <main className="flex-1 overflow-hidden">
          {activeTab === 'visualization' && (
            <div className="h-full flex flex-col">
              <div className="flex-1 relative">
                <MagneticFieldViewer
                  coil1={coil1}
                  coil2={dualMode ? coil2 : null}
                  gridSize={gridSize}
                  showFieldArrows={showFieldArrows}
                  showFieldLines={showFieldLines}
                  fieldThreshold={fieldThreshold}
                  fieldLineWidth={fieldLineWidth}
                  fieldLineDensity={fieldLineDensity}
                  onPhysicsUpdate={setPhysicsData}
                />
              </div>
              <div className="shrink-0 border-t" style={{ borderColor: 'var(--lab-panel-border)', background: 'var(--lab-aside-bg)' }}>
                <VerificationPanel />
              </div>
            </div>
          )}

          {activeTab === 'analysis' && (
            <div className="h-full">
              <DataFittingPanel />
            </div>
          )}

          {activeTab === 'learning' && (
            <div className="h-full">
              <LearningResources />
            </div>
          )}
        </main>

        {/* Right Panel */}
        {activeTab === 'visualization' && rightPanelOpen && (
          <aside
            className="w-72 shrink-0 border-l overflow-y-auto"
            style={{ borderColor: 'var(--lab-panel-border)', background: 'var(--lab-aside-bg)' }}
          >
            <div className="panel-header">物理量读数</div>
            <div className="p-3 space-y-3">
              <PhysicsReadout label="线圈1 自感 L₁" value={physicsData?.L1} unit="H" />
              {dualMode && (
                <>
                  <PhysicsReadout label="线圈2 自感 L₂" value={physicsData?.L2} unit="H" />
                  <div className="h-px" style={{ background: 'var(--lab-panel-border)' }} />
                  <PhysicsReadout label="互感 M" value={physicsData?.M} unit="H" highlight />
                  <PhysicsReadout label="磁通 Φ" value={physicsData?.flux} unit="Wb" />
                  <PhysicsReadout label="耦合系数 k" value={physicsData?.k} unit="" isRatio />
                  {physicsData && physicsData.k > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono t-muted-soft">
                        <span>弱耦合</span>
                        <span>强耦合</span>
                      </div>
                      <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--lab-primary-soft)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${Math.min(physicsData.k, 1) * 100}%`,
                            background: `linear-gradient(90deg, var(--lab-primary), var(--lab-success))`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
              <div className="h-px" style={{ background: 'var(--lab-panel-border)' }} />
              <PhysicsReadout label="最大 |B|" value={physicsData?.maxB} unit="T" />

              {/* Coil info */}
              <div className="panel rounded p-2 space-y-1">
                <div className="text-[9px] font-mono uppercase tracking-wider t-muted-soft">线圈1 参数</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] font-mono">
                  <span className="t-muted-soft">R</span>
                  <span className="text-right" style={{ color: 'var(--lab-value-text)' }}>{coil1.radius.toFixed(3)} m</span>
                  <span className="t-muted-soft">I</span>
                  <span className="text-right" style={{ color: 'var(--lab-value-text)' }}>{coil1.current.toFixed(1)} A</span>
                  <span className="t-muted-soft">N</span>
                  <span className="text-right" style={{ color: 'var(--lab-value-text)' }}>{coil1.turns}</span>
                  {coil1.turns > 1 && (
                    <>
                      <span className="t-muted-soft">pitch</span>
                      <span className="text-right" style={{ color: 'var(--lab-value-text)' }}>{coil1.pitch.toFixed(3)} m</span>
                    </>
                  )}
                </div>
              </div>

              {dualMode && coil2 && (
                <div className="panel rounded p-2 space-y-1">
                  <div className="text-[9px] font-mono uppercase tracking-wider t-muted-soft">线圈2 参数</div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] font-mono">
                    <span className="t-muted-soft">R</span>
                    <span className="text-right" style={{ color: 'var(--lab-value-text)' }}>{coil2.radius.toFixed(3)} m</span>
                    <span className="t-muted-soft">I</span>
                    <span className="text-right" style={{ color: 'var(--lab-value-text)' }}>{coil2.current.toFixed(1)} A</span>
                    <span className="t-muted-soft">N</span>
                    <span className="text-right" style={{ color: 'var(--lab-value-text)' }}>{coil2.turns}</span>
                    <span className="t-muted-soft">z</span>
                    <span className="text-right" style={{ color: 'var(--lab-value-text)' }}>{coil2.position[2].toFixed(3)} m</span>
                  </div>
                </div>
              )}

              <div className="panel rounded p-2 space-y-1">
                <div className="text-[9px] font-mono uppercase tracking-wider t-muted-soft">公式参考</div>
                <div className="text-[10px] font-mono space-y-1 t-muted">
                  <p>B_z = μ₀IR²/[2(R²+z²)^(3/2)]</p>
                  <p>L = μ₀N²πR²/l</p>
                  {dualMode && (
                    <>
                      <p>M = Φ₂₁/I₁</p>
                      <p>k = M/√(L₁L₂)</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Status bar */}
      <footer
        className="h-6 shrink-0 flex items-center px-3 border-t text-[9px] font-mono"
        style={{
          borderColor: 'var(--lab-panel-border)',
          background: 'var(--lab-header-bg)',
          color: 'var(--lab-muted-soft)',
        }}
      >
        <span>μ₀ = 4π×10⁻⁷ T·m/A</span>
        <span className="mx-3">|</span>
        <span>Biot-Savart: dB = (μ₀/4π)(I·dl×r̂)/r²</span>
        <span className="mx-3">|</span>
        <span>{isDark ? '深色模式' : '投影仪模式'}</span>
        <span className="ml-auto">Grid: {gridSize}³ = {gridSize ** 3} points</span>
      </footer>
    </div>
  );
}

function PhysicsReadout({
  label,
  value,
  unit,
  highlight,
  isRatio,
}: {
  label: string;
  value: number | undefined;
  unit: string;
  highlight?: boolean;
  isRatio?: boolean;
}) {
  const formatValue = (v: number) => {
    if (isRatio) return v.toFixed(4);
    if (Math.abs(v) < 1e-15) return '0';
    const exp = Math.floor(Math.log10(Math.abs(v)));
    if (exp >= -2 && exp <= 3) return v.toPrecision(4);
    return v.toExponential(3);
  };

  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] t-muted-soft">{label}</span>
      <div
        className="led-display text-sm"
        style={highlight ? { color: 'var(--lab-secondary)' } : undefined}
      >
        {value !== undefined ? formatValue(value) : '—'}
        {unit && <span className="text-[10px] ml-1 t-muted-soft">{unit}</span>}
      </div>
    </div>
  );
}
