import { describe, expect, it } from 'vitest';
import { generateFieldLines, generateSymmetricFieldLines, resampleFieldLine } from '@/lib/fieldLines';
import {
  calculateBField,
  CoilParams,
  DEFAULT_COIL,
  runVerification,
  Vec3,
  vecDot,
  vecMag,
} from '@/lib/physics';

function segmentDirection(a: Vec3, b: Vec3): Vec3 {
  return [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
}

function expectFinitePoint(point: Vec3, boundaryExtent: number) {
  expect(Number.isFinite(point[0])).toBe(true);
  expect(Number.isFinite(point[1])).toBe(true);
  expect(Number.isFinite(point[2])).toBe(true);
  expect(Math.abs(point[0])).toBeLessThanOrEqual(boundaryExtent);
  expect(Math.abs(point[1])).toBeLessThanOrEqual(boundaryExtent);
  expect(Math.abs(point[2])).toBeLessThanOrEqual(boundaryExtent);
}

function minDistanceBetweenDifferentLines(lines: { points: Vec3[] }[], stride = 3): number {
  let min = Infinity;
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      for (let a = 0; a < lines[i].points.length; a += stride) {
        for (let b = 0; b < lines[j].points.length; b += stride) {
          const p = lines[i].points[a];
          const q = lines[j].points[b];
          const dx = p[0] - q[0];
          const dy = p[1] - q[1];
          const dz = p[2] - q[2];
          min = Math.min(min, Math.sqrt(dx * dx + dy * dy + dz * dz));
        }
      }
    }
  }
  return min;
}

function radiusFromCenter(point: Vec3, center: Vec3): number {
  const dx = point[0] - center[0];
  const dy = point[1] - center[1];
  return Math.sqrt(dx * dx + dy * dy);
}

describe('field line generation', () => {
  it('keeps single-loop field lines finite, bounded, and aligned with the local B field', () => {
    const coil: CoilParams = { ...DEFAULT_COIL, radius: 0.1, current: 1, turns: 1, pitch: 0 };
    const boundaryExtent = 0.54;
    const result = generateFieldLines([coil], {
      extent: 0.3,
      targetSpacing: 0.024,
      maxLines: 12,
      maxSteps: 260,
      minAcceptedSamples: 12,
      boundaryExtent,
      segmentsPerTurn: 32,
    });

    expect(result.lines.length).toBeGreaterThan(3);
    let aligned = 0;
    let checked = 0;

    for (const line of result.lines) {
      expect(line.points.length).toBeGreaterThanOrEqual(12);
      expect(line.arrowIndices.every(idx => idx > 0 && idx < line.points.length - 1)).toBe(true);

      for (const point of line.points) expectFinitePoint(point, boundaryExtent);

      const stride = Math.max(1, Math.floor(line.points.length / 8));
      for (let i = 0; i < line.points.length - 1; i += stride) {
        const tangent = segmentDirection(line.points[i], line.points[i + 1]);
        const tMag = vecMag(tangent);
        const B = calculateBField(line.points[i], coil, 32);
        const bMag = vecMag(B);
        if (tMag < 1e-12 || bMag < 1e-15) continue;
        if (vecDot(tangent, B) / (tMag * bMag) > 0.2) aligned++;
        checked++;
      }
    }

    expect(checked).toBeGreaterThan(0);
    expect(aligned / checked).toBeGreaterThan(0.7);
  });

  it('keeps dense solenoid lines separated by the occupancy spacing', () => {
    const coil: CoilParams = {
      ...DEFAULT_COIL,
      radius: 0.05,
      current: 2,
      turns: 20,
      pitch: 0.005,
    };
    const targetSpacing = 0.018;
    const result = generateFieldLines([coil], {
      extent: 0.25,
      targetSpacing,
      maxLines: 14,
      maxSteps: 220,
      minAcceptedSamples: 10,
      boundaryExtent: 0.45,
      segmentsPerTurn: 16,
    });

    expect(result.lines.length).toBeGreaterThan(3);
    expect(minDistanceBetweenDifferentLines(result.lines)).toBeGreaterThan(targetSpacing * 0.68);
  });

  it('stays stable for dual-coil same-current and opposing-current configurations', () => {
    const base: CoilParams = {
      ...DEFAULT_COIL,
      radius: 0.1,
      current: 1,
      turns: 8,
      pitch: 0.006,
    };
    const configs: CoilParams[][] = [
      [base, { ...base, position: [0, 0, 0.16], current: 1 }],
      [base, { ...base, position: [0, 0, 0.16], current: -1 }],
    ];

    for (const coils of configs) {
      const result = generateFieldLines(coils, {
        extent: 0.45,
        targetSpacing: 0.032,
        maxLines: 10,
        maxSteps: 180,
        minAcceptedSamples: 8,
        boundaryExtent: 0.81,
        segmentsPerTurn: 14,
      });

      expect(result.lines.length).toBeGreaterThan(0);
      expect(result.lines.length).toBeLessThanOrEqual(10);
      expect(result.stats.totalVertices).toBeLessThanOrEqual(16000);
      for (const line of result.lines) {
        for (const point of line.points) expectFinitePoint(point, 0.81);
      }
    }
  });

  it('generates complete rotational families for centered symmetric field lines', () => {
    const coil: CoilParams = { ...DEFAULT_COIL, radius: 0.1, current: 1, turns: 1, pitch: 0 };
    const result = generateSymmetricFieldLines([coil], {
      extent: 0.3,
      targetSpacing: 0.024,
      maxLines: 16,
      maxSteps: 240,
      minAcceptedSamples: 10,
      boundaryExtent: 0.54,
      segmentsPerTurn: 32,
      copies: 8,
      radialSeedCount: 5,
      zSeedLevels: 2,
    });

    expect(result.lines.length).toBeGreaterThanOrEqual(8);
    expect(result.lines.length % 8).toBe(0);

    const firstFamily = result.lines.filter(line => line.familyId === result.lines[0].familyId);
    expect(firstFamily).toHaveLength(8);
    expect(firstFamily.map(line => line.copyIndex).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);

    const center = firstFamily[0].symmetryCenter ?? [0, 0, 0];
    for (let i = 1; i < firstFamily.length; i++) {
      expect(firstFamily[i].points.length).toBe(firstFamily[0].points.length);
      const r0 = radiusFromCenter(firstFamily[0].points[0], center);
      const ri = radiusFromCenter(firstFamily[i].points[0], center);
      expect(Math.abs(r0 - ri)).toBeLessThan(1e-8);
    }
  });

  it('uses the active coil system center for symmetric dual-coil lines', () => {
    const base: CoilParams = {
      ...DEFAULT_COIL,
      radius: 0.1,
      current: 1,
      turns: 4,
      pitch: 0.006,
    };
    const result = generateSymmetricFieldLines([base, { ...base, position: [0, 0, 0.2] }], {
      extent: 0.45,
      targetSpacing: 0.032,
      maxLines: 12,
      maxSteps: 180,
      minAcceptedSamples: 8,
      boundaryExtent: 0.81,
      segmentsPerTurn: 14,
      copies: 6,
      radialSeedCount: 4,
      zSeedLevels: 2,
    });

    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.lines[0].symmetryCenter?.[2]).toBeCloseTo(0.1, 2);
  });

  it('resamples line input so wide-line geometry avoids long coarse segments', () => {
    const points: Vec3[] = [[0, 0, 0], [0.2, 0, 0], [0.2, 0.2, 0]];
    const resampled = resampleFieldLine(points, 0.025);

    expect(resampled.length).toBeGreaterThan(points.length);
    for (let i = 0; i < resampled.length - 1; i++) {
      const d = vecMag(segmentDirection(resampled[i], resampled[i + 1]));
      expect(d).toBeLessThanOrEqual(0.025 + 1e-12);
    }
  });

  it('preserves the analytical on-axis Biot-Savart verification', () => {
    expect(runVerification().passed).toBe(true);
  });
});
