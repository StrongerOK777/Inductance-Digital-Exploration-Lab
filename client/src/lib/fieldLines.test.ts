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

function totalField(point: Vec3, coils: CoilParams[]): Vec3 {
  let bx = 0;
  let by = 0;
  let bz = 0;
  for (const coil of coils) {
    const B = calculateBField(point, coil, 32);
    bx += B[0];
    by += B[1];
    bz += B[2];
  }
  return [bx, by, bz];
}

function orientation2d(a: [number, number], b: [number, number], c: [number, number]): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function segmentsIntersect2d(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number]
): boolean {
  const o1 = orientation2d(a, b, c);
  const o2 = orientation2d(a, b, d);
  const o3 = orientation2d(c, d, a);
  const o4 = orientation2d(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

function hasRZSelfIntersection(points: Vec3[], center: Vec3): boolean {
  const rz = points.map((point): [number, number] => [radiusFromCenter(point, center), point[2]]);
  const closed = Math.hypot(rz[0][0] - rz[rz.length - 1][0], rz[0][1] - rz[rz.length - 1][1]) < 1e-8;

  for (let i = 0; i < rz.length - 1; i++) {
    for (let j = i + 2; j < rz.length - 1; j++) {
      if (closed && i === 0 && j === rz.length - 2) continue;
      if (segmentsIntersect2d(rz[i], rz[i + 1], rz[j], rz[j + 1])) return true;
    }
  }
  return false;
}

function rzTurnStats(points: Vec3[], center: Vec3): { maxAngle: number; countOver35: number } {
  const rz = points.map((point): [number, number] => [radiusFromCenter(point, center), point[2]]);
  let maxAngle = 0;
  let countOver35 = 0;

  for (let i = 1; i < rz.length - 1; i++) {
    const ux = rz[i][0] - rz[i - 1][0];
    const uz = rz[i][1] - rz[i - 1][1];
    const vx = rz[i + 1][0] - rz[i][0];
    const vz = rz[i + 1][1] - rz[i][1];
    const um = Math.sqrt(ux * ux + uz * uz);
    const vm = Math.sqrt(vx * vx + vz * vz);
    if (um < 1e-12 || vm < 1e-12) continue;
    const cos = Math.max(-1, Math.min(1, (ux * vx + uz * vz) / (um * vm)));
    const angle = (Math.acos(cos) * 180) / Math.PI;
    maxAngle = Math.max(maxAngle, angle);
    if (angle > 35) countOver35++;
  }

  return { maxAngle, countOver35 };
}

function totalFieldAlignmentRatio(lines: { points: Vec3[] }[], coils: CoilParams[]): number {
  let aligned = 0;
  let checked = 0;

  for (const line of lines) {
    const stride = Math.max(1, Math.floor(line.points.length / 14));
    for (let i = 0; i < line.points.length - 1; i += stride) {
      const tangent = segmentDirection(line.points[i], line.points[i + 1]);
      const tMag = vecMag(tangent);
      const B = totalField(line.points[i], coils);
      const bMag = vecMag(B);
      if (tMag < 1e-12 || bMag < 1e-15) continue;
      if (vecDot(tangent, B) / (tMag * bMag) > 0.2) aligned++;
      checked++;
    }
  }

  expect(checked).toBeGreaterThan(0);
  return aligned / checked;
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

  it('generates system-level dual-coil flux lines without RZ self-intersections', () => {
    const coil1: CoilParams = { ...DEFAULT_COIL, radius: 0.1, current: 1, turns: 1, pitch: 0 };
    const coil2: CoilParams = { ...coil1, position: [0, 0, 0.15] };
    const coils = [coil1, coil2];
    const result = generateSymmetricFieldLines(coils, {
      extent: 0.35,
      targetSpacing: 0.022,
      maxLines: 240,
      maxSteps: 900,
      minAcceptedSamples: 16,
      boundaryExtent: 0.63,
      maxVertices: 120000,
      segmentsPerTurn: 32,
      copies: 24,
      radialSeedCount: 8,
      zSeedLevels: 3,
    });

    expect(result.lines.length).toBeGreaterThanOrEqual(48);
    expect(result.lines.length % 24).toBe(0);

    const canonicalLines = result.lines.filter(line => line.copyIndex === 0);
    expect(canonicalLines.length).toBeGreaterThanOrEqual(2);
    const center = result.lines[0].symmetryCenter ?? [0, 0, 0.075];

    let bridgesIntercoilGap = false;
    for (const line of canonicalLines) {
      expect(line.points.length).toBeGreaterThanOrEqual(16);
      for (const point of line.points) expectFinitePoint(point, 0.63);
      expect(hasRZSelfIntersection(line.points, center)).toBe(false);

      const minZ = Math.min(...line.points.map(point => point[2]));
      const maxZ = Math.max(...line.points.map(point => point[2]));
      const minR = Math.min(...line.points.map(point => radiusFromCenter(point, center)));
      if (minZ < 0.04 && maxZ > 0.11 && minR < 0.14) bridgesIntercoilGap = true;
    }

    expect(bridgesIntercoilGap).toBe(true);
    expect(totalFieldAlignmentRatio(canonicalLines, coils)).toBeGreaterThan(0.75);
  });

  it('keeps close dual-coil flux lines smooth at the z=0.09m regression case', () => {
    const coil1: CoilParams = { ...DEFAULT_COIL, radius: 0.1, current: 1, turns: 1, pitch: 0 };
    const coil2: CoilParams = { ...coil1, position: [0, 0, 0.09] };
    const coils = [coil1, coil2];
    const result = generateSymmetricFieldLines(coils, {
      extent: 0.3,
      targetSpacing: 0.022,
      maxLines: 24,
      maxSteps: 900,
      minAcceptedSamples: 16,
      boundaryExtent: 0.54,
      maxVertices: 30000,
      segmentsPerTurn: 32,
      copies: 6,
      radialSeedCount: 3,
      zSeedLevels: 3,
    });

    expect(result.lines.length).toBeGreaterThanOrEqual(12);
    const center = result.lines[0].symmetryCenter ?? [0, 0, 0.045];
    const canonicalLines = result.lines.filter(line => line.copyIndex === 0);
    expect(canonicalLines.length).toBeGreaterThanOrEqual(2);

    for (const line of canonicalLines) {
      for (const point of line.points) expectFinitePoint(point, 0.54);
      expect(hasRZSelfIntersection(line.points, center)).toBe(false);
      const stats = rzTurnStats(line.points, center);
      expect(stats.maxAngle).toBeLessThanOrEqual(55);
      expect(stats.countOver35).toBeLessThanOrEqual(Math.max(0, Math.floor(line.points.length / 80)));
    }

    expect(totalFieldAlignmentRatio(canonicalLines, coils)).toBeGreaterThan(0.75);
  });

  it('keeps same-current dual-coil flux lines smooth across common z spacings', () => {
    const zSpacings = [0.07, 0.08, 0.09, 0.1, 0.12, 0.15, 0.2];

    for (const z of zSpacings) {
      const coil1: CoilParams = { ...DEFAULT_COIL, radius: 0.1, current: 1, turns: 1, pitch: 0 };
      const coil2: CoilParams = { ...coil1, position: [0, 0, z] };
      const coils = [coil1, coil2];
      const extent = Math.max(coil1.radius * 3, Math.abs(z) + coil2.radius * 2, 0.25);
      const result = generateSymmetricFieldLines(coils, {
        extent,
        targetSpacing: Math.min(Math.max(extent * 0.075, coil1.radius * 0.08), coil1.radius * 0.22),
        maxLines: 32,
        maxSteps: 900,
        minAcceptedSamples: 16,
        boundaryExtent: extent * 1.8,
        maxVertices: 50000,
        segmentsPerTurn: 28,
        copies: 8,
        radialSeedCount: 3,
        zSeedLevels: 3,
      });

      expect(result.lines.length, `z=${z}`).toBeGreaterThanOrEqual(8);
      const center = result.lines[0].symmetryCenter ?? [0, 0, z / 2];
      const canonicalLines = result.lines.filter(line => line.copyIndex === 0);
      expect(canonicalLines.length, `z=${z}`).toBeGreaterThanOrEqual(1);

      for (const line of canonicalLines) {
        for (const point of line.points) expectFinitePoint(point, extent * 1.8);
        expect(hasRZSelfIntersection(line.points, center), `z=${z}`).toBe(false);
        const stats = rzTurnStats(line.points, center);
        expect(stats.maxAngle, `z=${z}`).toBeLessThanOrEqual(55);
        expect(stats.countOver35, `z=${z}`).toBeLessThanOrEqual(Math.max(0, Math.floor(line.points.length / 80)));
      }

      expect(totalFieldAlignmentRatio(canonicalLines, coils), `z=${z}`).toBeGreaterThan(0.72);
    }
  });

  it('keeps opposing dual-coil flux lines finite and free of compact knots near the null region', () => {
    const coil1: CoilParams = { ...DEFAULT_COIL, radius: 0.1, current: 1, turns: 1, pitch: 0 };
    const coil2: CoilParams = { ...coil1, current: -1, position: [0, 0, 0.15] };
    const coils = [coil1, coil2];
    const result = generateSymmetricFieldLines(coils, {
      extent: 0.35,
      targetSpacing: 0.022,
      maxLines: 168,
      maxSteps: 900,
      minAcceptedSamples: 12,
      boundaryExtent: 0.63,
      maxVertices: 90000,
      segmentsPerTurn: 32,
      copies: 24,
      radialSeedCount: 8,
      zSeedLevels: 3,
    });

    expect(result.lines.length).toBeGreaterThanOrEqual(24);
    const center = result.lines[0].symmetryCenter ?? [0, 0, 0.075];
    for (const line of result.lines.filter(line => line.copyIndex === 0)) {
      for (const point of line.points) expectFinitePoint(point, 0.63);
      expect(hasRZSelfIntersection(line.points, center)).toBe(false);
    }
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
