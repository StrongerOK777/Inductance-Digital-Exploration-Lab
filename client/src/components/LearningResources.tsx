/**
 * Learning Resources Component — Theme-aware
 */

import { useState } from 'react';
import {
  BookOpen, ChevronDown, ChevronRight, Lightbulb,
  GraduationCap, Atom, Zap, Link2,
} from 'lucide-react';

function Topic({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded overflow-hidden" style={{ border: '1px solid var(--lab-panel-border)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors"
        style={{ color: 'var(--lab-primary-text)' }}
      >
        {icon}
        <span className="flex-1 text-left">{title}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <div className="px-4 pb-4 text-xs leading-relaxed space-y-3 t-muted">
          {children}
        </div>
      )}
    </div>
  );
}

function Formula({ children }: { children: string }) {
  return (
    <div
      className="rounded px-3 py-2 font-mono text-center my-2"
      style={{
        background: 'var(--lab-formula-bg)',
        border: '1px solid var(--lab-panel-border)',
        color: 'var(--lab-value-text)',
      }}
    >
      {children}
    </div>
  );
}

function Tip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div className="mt-2 p-2 rounded text-xs" style={{
      background: 'var(--lab-tip-bg)',
      border: '1px solid var(--lab-tip-border)',
      color: 'var(--lab-muted)',
    }}>
      <Lightbulb size={12} className="inline mr-1" />
      {children}
    </div>
  );
}

export default function LearningResources() {
  return (
    <div className="h-full overflow-y-auto p-4 space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <BookOpen size={18} className="t-primary" />
        <h2 className="text-sm font-semibold font-mono uppercase tracking-wider t-primary">学习资源</h2>
      </div>

      <Topic title="Biot-Savart 定律" icon={<Atom size={14} className="t-primary" />}>
        <p>
          Biot-Savart 定律描述了电流元产生的磁场。对于载流导线上的电流元 Idl，
          在空间中某点 P 处产生的磁场为：
        </p>
        <Formula>dB = (μ₀/4π) × (I·dl × r̂) / r²</Formula>
        <p>其中：</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>μ₀ = 4π × 10⁻⁷ T·m/A — 真空磁导率</li>
          <li>I — 电流强度 (A)</li>
          <li>dl — 电流元矢量 (m)</li>
          <li>r̂ — 从电流元指向场点的单位矢量</li>
          <li>r — 电流元到场点的距离 (m)</li>
        </ul>
        <p className="mt-2">对于圆形线圈轴线上的磁场，可以解析求解：</p>
        <Formula>B_z(z) = μ₀IR² / [2(R² + z²)^(3/2)]</Formula>
        <p>在线圈中心 (z=0)：B_z = μ₀I/(2R)</p>
      </Topic>

      <Topic title="自感 (Self-Inductance)" icon={<Zap size={14} className="t-secondary" />}>
        <p>
          自感是描述线圈中电流变化时产生感应电动势能力的物理量。
          当线圈中的电流发生变化时，穿过线圈自身的磁通量也会变化，
          从而在线圈中产生感应电动势（自感电动势）。
        </p>
        <Formula>L = NΦ / I</Formula>
        <p>对于长螺线管（N匝，长度l，截面积A）：</p>
        <Formula>L = μ₀N²A / l = μ₀N²πR² / l</Formula>
        <p>关键关系：</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>L ∝ N²</strong> — 自感与匝数的平方成正比</li>
          <li><strong>L ∝ R²</strong> — 自感与半径的平方成正比</li>
          <li><strong>L ∝ 1/l</strong> — 自感与长度成反比</li>
        </ul>
        <Tip color="amber">
          实验提示：通过改变 N 或 R，测量 L 的变化，可以验证上述比例关系。
          使用幂律拟合 y = Ax^b，期望得到 b ≈ 2。
        </Tip>
      </Topic>

      <Topic title="互感 (Mutual Inductance)" icon={<Link2 size={14} className="t-success" />}>
        <p>
          互感描述了两个线圈之间的磁耦合。当线圈1中的电流 I₁ 变化时，
          穿过线圈2的磁通量也会变化，从而在线圈2中产生感应电动势。
        </p>
        <Formula>M = Φ₂₁ / I₁ = N₂Φ₂₁ / I₁</Formula>
        <p>Neumann 公式（精确计算）：</p>
        <Formula>M = (μ₀/4π) ∮∮ (dl₁ · dl₂) / |r₁₂|</Formula>
        <p>耦合系数：</p>
        <Formula>k = M / √(L₁L₂)，0 ≤ k ≤ 1</Formula>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>k = 1 — 完全耦合（理想变压器）</li>
          <li>k = 0 — 无耦合</li>
          <li>实际中 0 {'<'} k {'<'} 1</li>
        </ul>
        <p className="mt-2">对于两个同轴圆形线圈（半径 R₁, R₂，间距 d），当 d {'>'}{'>'}  R 时：</p>
        <Formula>M ≈ μ₀πN₁N₂R₁²R₂² / (2d³)</Formula>
        <p>即 M ∝ d⁻³，互感随距离的三次方衰减。</p>
      </Topic>

      <Topic title="法拉第电磁感应定律" icon={<GraduationCap size={14} style={{ color: 'var(--lab-primary)' }} />}>
        <p>法拉第电磁感应定律是自感和互感的理论基础：</p>
        <Formula>ε = -dΦ/dt = -L(dI/dt)</Formula>
        <p>对于互感耦合的两个线圈：</p>
        <Formula>ε₂ = -M(dI₁/dt)</Formula>
        <p>这是变压器、无线充电、电磁炉等技术的物理基础。</p>
        <Tip color="purple">
          思考题：为什么变压器的铁芯能提高耦合系数 k？
          提示：铁芯的相对磁导率 μᵣ {'>'}{'>'}  1，使磁通量更集中。
        </Tip>
      </Topic>

      <Topic title="数据拟合方法" icon={<BookOpen size={14} className="t-primary" />}>
        <p>在物理实验中，我们常需要从实验数据中提取物理规律。常用的拟合方法包括：</p>
        <div className="space-y-2 mt-2">
          <div>
            <p className="font-semibold" style={{ color: 'var(--lab-primary-text)' }}>1. 线性拟合 y = mx + b</p>
            <p>最小二乘法，适用于线性关系。R² 衡量拟合优度。</p>
          </div>
          <div>
            <p className="font-semibold" style={{ color: 'var(--lab-primary-text)' }}>2. 幂律拟合 y = Ax^b</p>
            <p>取对数转化为线性：ln(y) = ln(A) + b·ln(x)。在 log-log 坐标中为直线，斜率即为指数 b。</p>
          </div>
          <div>
            <p className="font-semibold" style={{ color: 'var(--lab-primary-text)' }}>3. 多项式拟合</p>
            <p>使用 Vandermonde 矩阵求解。注意过拟合：如果高次多项式的 R² 增长不到 1%，应选择低次模型。</p>
          </div>
        </div>
        <Tip color="blue">
          物理优先：即使高次多项式 R² 更高，也应优先选择有物理意义的模型。
          例如 L ∝ N² 应选幂律而非三次多项式。
        </Tip>
      </Topic>

      <Topic title="使用说明" icon={<BookOpen size={14} className="t-primary" />}>
        <div className="space-y-2">
          <p className="font-semibold" style={{ color: 'var(--lab-primary-text)' }}>3D 可视化模块</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>左侧面板调节线圈参数（半径、电流、匝数等）</li>
            <li>拖拽旋转3D视图，滚轮缩放，右键平移</li>
            <li>切换单/双线圈模式探究互感</li>
            <li>使用"快速实验"按钮加载预设配置</li>
          </ul>
          <p className="font-semibold mt-3" style={{ color: 'var(--lab-primary-text)' }}>数据分析模块</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>点击示例按钮加载预设数据集</li>
            <li>支持手动输入、CSV导入</li>
            <li>选择拟合类型（线性/多项式/幂律）</li>
            <li>查看统计面板了解拟合参数和教学反馈</li>
            <li>支持导出 CSV 和 PNG</li>
          </ul>
          <p className="font-semibold mt-3" style={{ color: 'var(--lab-primary-text)' }}>主题切换</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>点击顶部导航栏右侧的太阳/月亮图标切换主题</li>
            <li>浅色模式针对投影仪演示优化，提高对比度和可读性</li>
            <li>深色模式为蓝图风格，适合个人学习和屏幕阅读</li>
          </ul>
        </div>
      </Topic>
    </div>
  );
}
