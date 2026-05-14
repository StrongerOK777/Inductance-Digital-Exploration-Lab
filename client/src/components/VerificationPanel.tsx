/**
 * Verification Panel — Theme-aware
 */

import { useState, useMemo } from 'react';
import { runVerification, MU_0 } from '@/lib/physics';
import { CheckCircle2, XCircle, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function VerificationPanel() {
  const [showVerification, setShowVerification] = useState(false);

  const verification = useMemo(() => {
    if (!showVerification) return null;
    return runVerification();
  }, [showVerification]);

  return (
    <div className="panel rounded overflow-hidden">
      <div className="panel-header flex items-center justify-between">
        <span className="flex items-center gap-2">
          <FlaskConical size={12} />
          数值验证
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[10px] t-muted"
          onClick={() => setShowVerification(!showVerification)}
        >
          {showVerification ? '收起' : '运行验证'}
        </Button>
      </div>

      {showVerification && verification && (
        <div className="p-3 space-y-3">
          <div className="text-[10px] t-muted space-y-1">
            <p>测试条件：圆形线圈 R=0.1 m, I=1 A, N=1</p>
            <p>解析公式：B_z = μ₀IR²/[2(R²+z²)^(3/2)]</p>
            <p>z=0 处：B_z = μ₀I/(2R) = {(MU_0 * 1 / (2 * 0.1)).toExponential(4)} T</p>
          </div>

          <table className="w-full text-[10px] font-mono">
            <thead>
              <tr style={{ color: 'var(--lab-muted)', borderBottom: '1px solid var(--lab-panel-border)' }}>
                <th className="py-1 px-2 text-left">z (m)</th>
                <th className="py-1 px-2 text-right">数值 B_z (T)</th>
                <th className="py-1 px-2 text-right">解析 B_z (T)</th>
                <th className="py-1 px-2 text-right">误差 (%)</th>
                <th className="py-1 px-2 text-center">状态</th>
              </tr>
            </thead>
            <tbody>
              {verification.testPoints.map((z, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--lab-panel-border)' }}>
                  <td className="py-1 px-2 t-primary">{z.toFixed(1)}</td>
                  <td className="py-1 px-2 text-right" style={{ color: 'var(--lab-value-text)' }}>{verification.numerical[i].toExponential(4)}</td>
                  <td className="py-1 px-2 text-right" style={{ color: 'var(--lab-value-text)' }}>{verification.analytical[i].toExponential(4)}</td>
                  <td className="py-1 px-2 text-right t-secondary">{verification.errors[i].toFixed(4)}</td>
                  <td className="py-1 px-2 text-center">
                    {verification.errors[i] < 1
                      ? <CheckCircle2 size={12} className="inline t-success" />
                      : <XCircle size={12} className="inline t-danger" />
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={`flex items-center gap-2 text-xs ${verification.passed ? 't-success' : 't-danger'}`}>
            {verification.passed
              ? <><CheckCircle2 size={14} /><span>所有测试点误差 {'<'} 1%，数值计算通过验证</span></>
              : <><XCircle size={14} /><span>部分测试点误差超过 1%</span></>
            }
          </div>
        </div>
      )}
    </div>
  );
}
