import {
  calculateBFieldFromSegments,
  CoilParams,
  CoilSegment,
  generateCoilSegments,
  Vec3,
  vecDot,
  vecMag,
} from '@/lib/physics';

export type FieldLinePoint = Vec3;

export interface FieldLine {
  points: FieldLinePoint[];
  arrowIndices: number[];
  seed: Vec3;
  familyId?: number;
  copyIndex?: number;
  copyCount?: number;
  symmetryCenter?: Vec3;
  canonicalSeed?: Vec3;
}

export interface FieldLineOptions {
  extent: number;
  targetSpacing: number;
  maxLines: number;
  maxSteps: number;
  stepSize?: number;
  minAcceptedSamples?: number;
  minFieldMagnitude?: number;
  boundaryExtent?: number;
  maxVertices?: number;
  segmentsPerTurn?: number;
}

export interface FieldLineSymmetryOptions extends FieldLineOptions {
  center?: Vec3;
  copies?: number;
  radialSeedCount?: number;
  zSeedLevels?: number;
}

export interface FieldLineResult {
  lines: FieldLine[];
  stats: {
    acceptedSeeds: number;
    rejectedSeeds: number;
    totalVertices: number;
    targetSpacing: number;
  };
}

interface FieldSource {
  segments: CoilSegment[];
  current: number;
}

interface SeedCandidate {
  pos: Vec3;
  mag: number;
}

const DEFAULT_MIN_FIELD_MAGNITUDE = 1e-15;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function distSq(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

function distance(a: Vec3, b: Vec3): number {
  return Math.sqrt(distSq(a, b));
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function isFiniteVec(v: Vec3): boolean {
  return Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);
}

function insideBoundary(p: Vec3, boundaryExtent: number): boolean {
  return Math.abs(p[0]) <= boundaryExtent && Math.abs(p[1]) <= boundaryExtent && Math.abs(p[2]) <= boundaryExtent;
}

function rotateAroundCenterZ(p: Vec3, center: Vec3, angle: number): Vec3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = p[0] - center[0];
  const dy = p[1] - center[1];
  return [center[0] + dx * cos - dy * sin, center[1] + dx * sin + dy * cos, p[2]];
}

function segmentsPerTurnFor(coil: CoilParams, override?: number): number {
  if (override !== undefined) return override;
  return clamp(Math.floor(1200 / Math.max(1, coil.turns)), 12, 64);
}

function buildSources(coils: CoilParams[], segmentsPerTurn?: number): FieldSource[] {
  return coils
    .filter(coil => Math.abs(coil.current) > 1e-10)
    .map(coil => ({
      segments: generateCoilSegments(coil, segmentsPerTurnFor(coil, segmentsPerTurn)),
      current: coil.current,
    }));
}

function calculateTotalFieldFromSources(point: Vec3, sources: FieldSource[]): Vec3 {
  let Bx = 0;
  let By = 0;
  let Bz = 0;

  for (const source of sources) {
    const B = calculateBFieldFromSegments(point, source.segments, source.current);
    Bx += B[0];
    By += B[1];
    Bz += B[2];
  }

  return [Bx, By, Bz];
}

class OccupancyGrid {
  private readonly cells = new Map<string, Vec3[]>();
  private readonly cellSize: number;

  constructor(private readonly spacing: number) {
    this.cellSize = Math.max(spacing, 1e-6);
  }

  hasNearby(point: Vec3, distance = this.spacing): boolean {
    const radius = Math.ceil(distance / this.cellSize);
    const cx = Math.floor(point[0] / this.cellSize);
    const cy = Math.floor(point[1] / this.cellSize);
    const cz = Math.floor(point[2] / this.cellSize);
    const limitSq = distance * distance;

    for (let ix = cx - radius; ix <= cx + radius; ix++) {
      for (let iy = cy - radius; iy <= cy + radius; iy++) {
        for (let iz = cz - radius; iz <= cz + radius; iz++) {
          const bucket = this.cells.get(`${ix},${iy},${iz}`);
          if (!bucket) continue;
          for (const existing of bucket) {
            if (distSq(point, existing) < limitSq) return true;
          }
        }
      }
    }

    return false;
  }

  add(point: Vec3): void {
    const key = [
      Math.floor(point[0] / this.cellSize),
      Math.floor(point[1] / this.cellSize),
      Math.floor(point[2] / this.cellSize),
    ].join(',');
    const bucket = this.cells.get(key);
    if (bucket) {
      bucket.push(point);
    } else {
      this.cells.set(key, [point]);
    }
  }

  addLine(points: Vec3[]): void {
    for (const point of points) this.add(point);
  }
}

function unitField(
  point: Vec3,
  sources: FieldSource[],
  direction: 1 | -1,
  minFieldMagnitude: number
): Vec3 | null {
  const B = calculateTotalFieldFromSources(point, sources);
  const mag = vecMag(B);
  if (mag < minFieldMagnitude) return null;
  return [direction * B[0] / mag, direction * B[1] / mag, direction * B[2] / mag];
}

function rk4Step(
  point: Vec3,
  h: number,
  direction: 1 | -1,
  sources: FieldSource[],
  minFieldMagnitude: number
): Vec3 | null {
  const k1 = unitField(point, sources, direction, minFieldMagnitude);
  if (!k1) return null;

  const p2 = add(point, scale(k1, h * 0.5));
  const k2 = unitField(p2, sources, direction, minFieldMagnitude);
  if (!k2) return null;

  const p3 = add(point, scale(k2, h * 0.5));
  const k3 = unitField(p3, sources, direction, minFieldMagnitude);
  if (!k3) return null;

  const p4 = add(point, scale(k3, h));
  const k4 = unitField(p4, sources, direction, minFieldMagnitude);
  if (!k4) return null;

  return [
    point[0] + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
    point[1] + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    point[2] + (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
  ];
}

function adaptiveStep(
  point: Vec3,
  stepSize: number,
  minStep: number,
  maxStep: number,
  maxError: number,
  direction: 1 | -1,
  sources: FieldSource[],
  minFieldMagnitude: number
): { point: Vec3; nextStep: number } | null {
  let h = stepSize;

  for (let attempt = 0; attempt < 7; attempt++) {
    const full = rk4Step(point, h, direction, sources, minFieldMagnitude);
    if (!full) return null;

    const halfA = rk4Step(point, h * 0.5, direction, sources, minFieldMagnitude);
    if (!halfA) return null;

    const halfB = rk4Step(halfA, h * 0.5, direction, sources, minFieldMagnitude);
    if (!halfB) return null;

    const error = Math.sqrt(distSq(full, halfB));
    if (error <= maxError || h <= minStep * 1.01) {
      const nextStep = error < maxError * 0.2 ? Math.min(h * 1.35, maxStep) : h;
      return { point: halfB, nextStep };
    }

    h = Math.max(h * 0.5, minStep);
  }

  return null;
}

function traceDirection(
  seed: Vec3,
  direction: 1 | -1,
  sources: FieldSource[],
  occupancy: OccupancyGrid,
  options: Required<Pick<FieldLineOptions, 'maxSteps' | 'targetSpacing' | 'stepSize' | 'minFieldMagnitude' | 'boundaryExtent'>>
): Vec3[] {
  const points: Vec3[] = [[...seed]];
  let pos: Vec3 = [...seed];
  let h = options.stepSize;
  const minStep = options.stepSize * 0.25;
  const maxStep = options.stepSize * 2;
  const maxError = options.targetSpacing * 0.08;

  for (let step = 0; step < options.maxSteps; step++) {
    const next = adaptiveStep(
      pos,
      h,
      minStep,
      maxStep,
      maxError,
      direction,
      sources,
      options.minFieldMagnitude
    );
    if (!next || !isFiniteVec(next.point) || !insideBoundary(next.point, options.boundaryExtent)) break;
    if (occupancy.hasNearby(next.point, options.targetSpacing * 0.95)) break;

    pos = next.point;
    h = next.nextStep;
    points.push([...pos]);

    if (step > 40 && distSq(pos, seed) < options.targetSpacing * options.targetSpacing * 0.35) {
      points.push([...seed]);
      break;
    }
  }

  return points;
}

function buildArrowIndices(points: Vec3[]): number[] {
  if (points.length < 12) return [];
  const count = points.length > 120 ? 3 : points.length > 60 ? 2 : 1;
  const indices: number[] = [];
  for (let i = 1; i <= count; i++) {
    const idx = Math.round((i / (count + 1)) * (points.length - 2));
    if (idx > 0 && idx < points.length - 1) indices.push(idx);
  }
  return indices;
}

export function resampleFieldLine(points: Vec3[], maxSegmentLength: number): Vec3[] {
  if (points.length < 2 || maxSegmentLength <= 0) return points.map(point => [...point]);
  const resampled: Vec3[] = [[...points[0]]];

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const d = distance(a, b);
    const steps = Math.max(1, Math.ceil(d / maxSegmentLength));

    for (let j = 1; j <= steps; j++) {
      const t = j / steps;
      resampled.push([
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
      ]);
    }
  }

  return resampled;
}

function getActiveSystemCenter(coils: CoilParams[]): Vec3 {
  const activeCoils = coils.filter(coil => Math.abs(coil.current) > 1e-10);
  if (activeCoils.length === 0) return [0, 0, 0];

  let x = 0;
  let y = 0;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const coil of activeCoils) {
    x += coil.position[0];
    y += coil.position[1];
    const halfLength = ((coil.turns - 1) * coil.pitch) / 2;
    minZ = Math.min(minZ, coil.position[2] - halfLength);
    maxZ = Math.max(maxZ, coil.position[2] + halfLength);
  }

  return [x / activeCoils.length, y / activeCoils.length, (minZ + maxZ) / 2];
}

function createSymmetricSeedCandidates(
  coils: CoilParams[],
  sources: FieldSource[],
  center: Vec3,
  targetSpacing: number,
  boundaryExtent: number,
  minFieldMagnitude: number,
  radialSeedCount: number,
  zSeedLevels: number
): SeedCandidate[] {
  const activeCoils = coils.filter(coil => Math.abs(coil.current) > 1e-10);
  if (activeCoils.length === 0) return [];

  const maxRadius = Math.max(...activeCoils.map(coil => coil.radius));
  const minRadius = Math.max(maxRadius * 0.24, targetSpacing * 1.35);
  const outerRadius = Math.min(boundaryExtent * 0.82, maxRadius * 2.35);
  const radiusSteps = Math.max(2, radialSeedCount);
  const zSpan = Math.max(
    maxRadius * 0.16,
    ...activeCoils.map(coil => Math.max(maxRadius * 0.12, ((coil.turns - 1) * coil.pitch) / 2))
  );
  const zSteps = Math.max(1, zSeedLevels);
  const candidates: SeedCandidate[] = [];
  const seen = new Set<string>();

  const addSeed = (pos: Vec3) => {
    if (!insideBoundary(pos, boundaryExtent)) return;
    const key = pos.map(v => Math.round(v / (targetSpacing * 0.35))).join(',');
    if (seen.has(key)) return;
    seen.add(key);
    const B = calculateTotalFieldFromSources(pos, sources);
    const mag = vecMag(B);
    if (mag < minFieldMagnitude) return;
    candidates.push({ pos, mag });
  };

  for (let zi = 0; zi < zSteps; zi++) {
    const zT = zSteps === 1 ? 0 : zi / (zSteps - 1) - 0.5;
    const z = center[2] + zT * zSpan * 1.2;

    for (let ri = 0; ri < radiusSteps; ri++) {
      const t = radiusSteps === 1 ? 0 : ri / (radiusSteps - 1);
      const r = minRadius + (outerRadius - minRadius) * t;
      addSeed([center[0] + r, center[1], z]);
    }
  }

  candidates.sort((a, b) => b.mag - a.mag);
  return candidates;
}

function rotateLineGroup(points: Vec3[], center: Vec3, copies: number, familyId: number, seed: Vec3): FieldLine[] {
  const lines: FieldLine[] = [];
  for (let copyIndex = 0; copyIndex < copies; copyIndex++) {
    const angle = (copyIndex / copies) * 2 * Math.PI;
    const rotatedPoints = points.map(point => rotateAroundCenterZ(point, center, angle));
    lines.push({
      points: rotatedPoints,
      arrowIndices: buildArrowIndices(rotatedPoints),
      seed: rotateAroundCenterZ(seed, center, angle),
      familyId,
      copyIndex,
      copyCount: copies,
      symmetryCenter: center,
      canonicalSeed: seed,
    });
  }
  return lines;
}

function groupHasNearby(group: FieldLine[], occupancy: OccupancyGrid, spacing: number): boolean {
  const stride = 2;
  for (const line of group) {
    for (let i = 0; i < line.points.length; i += stride) {
      if (occupancy.hasNearby(line.points[i], spacing)) return true;
    }
  }
  return false;
}

function addLineGroup(group: FieldLine[], occupancy: OccupancyGrid): void {
  for (const line of group) occupancy.addLine(line.points);
}

function createSeedCandidates(
  coils: CoilParams[],
  sources: FieldSource[],
  targetSpacing: number,
  boundaryExtent: number,
  minFieldMagnitude: number
): SeedCandidate[] {
  const candidates: SeedCandidate[] = [];
  const seen = new Set<string>();

  const addSeed = (pos: Vec3) => {
    if (!insideBoundary(pos, boundaryExtent)) return;
    const key = pos.map(v => Math.round(v / (targetSpacing * 0.35))).join(',');
    if (seen.has(key)) return;
    seen.add(key);

    const B = calculateTotalFieldFromSources(pos, sources);
    const mag = vecMag(B);
    if (mag < minFieldMagnitude) return;
    candidates.push({ pos, mag });
  };

  for (const coil of coils) {
    if (Math.abs(coil.current) < 1e-10) continue;
    const [cx, cy, cz] = coil.position;
    const halfLength = ((coil.turns - 1) * coil.pitch) / 2;
    const zLevels = halfLength > targetSpacing
      ? [-0.85, -0.35, 0.35, 0.85].map(t => cz + t * halfLength)
      : [cz - coil.radius * 0.08, cz + coil.radius * 0.08];
    const radialFactors = [0.18, 0.35, 0.55, 0.78, 1.08, 1.38, 1.75, 2.2];

    for (const z of zLevels) {
      for (const factor of radialFactors) {
        const r = coil.radius * factor;
        const count = clamp(Math.round((2 * Math.PI * r) / (targetSpacing * 1.8)), 6, 18);
        for (let i = 0; i < count; i++) {
          const phi = (i / count) * 2 * Math.PI + (factor % 0.3);
          addSeed([cx + r * Math.cos(phi), cy + r * Math.sin(phi), z]);
        }
      }
    }

    const shellRadius = Math.max(coil.radius * 2.4, targetSpacing * 3);
    for (let i = 0; i < 36; i++) {
      const z = 1 - (2 * (i + 0.5)) / 36;
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      const phi = i * GOLDEN_ANGLE;
      addSeed([
        cx + shellRadius * r * Math.cos(phi),
        cy + shellRadius * r * Math.sin(phi),
        cz + shellRadius * z,
      ]);
    }
  }

  candidates.sort((a, b) => b.mag - a.mag);
  return candidates;
}

function isDirectionallyConsistent(points: Vec3[], sources: FieldSource[], minFieldMagnitude: number): boolean {
  if (points.length < 2) return false;
  let aligned = 0;
  let checked = 0;
  const stride = Math.max(1, Math.floor(points.length / 12));

  for (let i = 0; i < points.length - 1; i += stride) {
    const segment: Vec3 = [
      points[i + 1][0] - points[i][0],
      points[i + 1][1] - points[i][1],
      points[i + 1][2] - points[i][2],
    ];
    const len = vecMag(segment);
    if (len < 1e-12) continue;
    const B = calculateTotalFieldFromSources(points[i], sources);
    const mag = vecMag(B);
    if (mag < minFieldMagnitude) continue;
    if (vecDot(segment, B) / (len * mag) > 0.25) aligned++;
    checked++;
  }

  return checked > 0 && aligned / checked > 0.65;
}

export function generateFieldLines(coils: CoilParams[], options: FieldLineOptions): FieldLineResult {
  const minAcceptedSamples = options.minAcceptedSamples ?? 16;
  const minFieldMagnitude = options.minFieldMagnitude ?? DEFAULT_MIN_FIELD_MAGNITUDE;
  const boundaryExtent = options.boundaryExtent ?? options.extent * 1.8;
  const stepSize = options.stepSize ?? options.targetSpacing * 0.45;
  const maxVertices = options.maxVertices ?? 16000;
  const sources = buildSources(coils, options.segmentsPerTurn);
  const occupancy = new OccupancyGrid(options.targetSpacing);
  const lines: FieldLine[] = [];
  let rejectedSeeds = 0;
  let totalVertices = 0;

  if (sources.length === 0) {
    return { lines, stats: { acceptedSeeds: 0, rejectedSeeds: 0, totalVertices: 0, targetSpacing: options.targetSpacing } };
  }

  const candidates = createSeedCandidates(coils, sources, options.targetSpacing, boundaryExtent, minFieldMagnitude);

  for (const candidate of candidates) {
    if (lines.length >= options.maxLines || totalVertices >= maxVertices) break;
    if (occupancy.hasNearby(candidate.pos, options.targetSpacing)) {
      rejectedSeeds++;
      continue;
    }

    const traceOptions = {
      maxSteps: options.maxSteps,
      targetSpacing: options.targetSpacing,
      stepSize,
      minFieldMagnitude,
      boundaryExtent,
    };
    const backward = traceDirection(candidate.pos, -1, sources, occupancy, traceOptions);
    const forward = traceDirection(candidate.pos, 1, sources, occupancy, traceOptions);
    const points = [...backward.slice(1).reverse(), ...forward];

    if (points.length < minAcceptedSamples || !isDirectionallyConsistent(points, sources, minFieldMagnitude)) {
      rejectedSeeds++;
      continue;
    }

    if (totalVertices + points.length > maxVertices) break;
    occupancy.addLine(points);
    totalVertices += points.length;
    lines.push({
      points,
      arrowIndices: buildArrowIndices(points),
      seed: candidate.pos,
    });
  }

  return {
    lines,
    stats: {
      acceptedSeeds: lines.length,
      rejectedSeeds,
      totalVertices,
      targetSpacing: options.targetSpacing,
    },
  };
}

export function generateSymmetricFieldLines(coils: CoilParams[], options: FieldLineSymmetryOptions): FieldLineResult {
  const minAcceptedSamples = options.minAcceptedSamples ?? 16;
  const minFieldMagnitude = options.minFieldMagnitude ?? DEFAULT_MIN_FIELD_MAGNITUDE;
  const boundaryExtent = options.boundaryExtent ?? options.extent * 1.8;
  const stepSize = options.stepSize ?? options.targetSpacing * 0.42;
  const maxVertices = options.maxVertices ?? 16000;
  const copies = options.copies ?? 12;
  const radialSeedCount = options.radialSeedCount ?? 7;
  const zSeedLevels = options.zSeedLevels ?? 3;
  const center = options.center ?? getActiveSystemCenter(coils);
  const sources = buildSources(coils, options.segmentsPerTurn);
  const occupancy = new OccupancyGrid(options.targetSpacing);
  const lines: FieldLine[] = [];
  let rejectedSeeds = 0;
  let totalVertices = 0;
  let familyId = 0;

  if (sources.length === 0) {
    return { lines, stats: { acceptedSeeds: 0, rejectedSeeds: 0, totalVertices: 0, targetSpacing: options.targetSpacing } };
  }

  const candidates = createSymmetricSeedCandidates(
    coils,
    sources,
    center,
    options.targetSpacing,
    boundaryExtent,
    minFieldMagnitude,
    radialSeedCount,
    zSeedLevels
  );
  const traceOptions = {
    maxSteps: options.maxSteps,
    targetSpacing: options.targetSpacing,
    stepSize,
    minFieldMagnitude,
    boundaryExtent,
  };

  for (const candidate of candidates) {
    if (lines.length >= options.maxLines || totalVertices >= maxVertices) break;
    const candidateGroupSeed = rotateLineGroup([candidate.pos], center, copies, familyId, candidate.pos);
    if (groupHasNearby(candidateGroupSeed, occupancy, options.targetSpacing)) {
      rejectedSeeds++;
      continue;
    }

    const emptyOccupancy = new OccupancyGrid(options.targetSpacing);
    const backward = traceDirection(candidate.pos, -1, sources, emptyOccupancy, traceOptions);
    const forward = traceDirection(candidate.pos, 1, sources, emptyOccupancy, traceOptions);
    const canonicalPoints = [...backward.slice(1).reverse(), ...forward];

    if (canonicalPoints.length < minAcceptedSamples || !isDirectionallyConsistent(canonicalPoints, sources, minFieldMagnitude)) {
      rejectedSeeds++;
      continue;
    }

    const group = rotateLineGroup(canonicalPoints, center, copies, familyId, candidate.pos);
    const groupVertices = group.reduce((sum, line) => sum + line.points.length, 0);
    if (lines.length + group.length > options.maxLines || totalVertices + groupVertices > maxVertices) break;
    if (groupHasNearby(group, occupancy, options.targetSpacing * 0.82)) {
      rejectedSeeds++;
      continue;
    }

    addLineGroup(group, occupancy);
    lines.push(...group);
    totalVertices += groupVertices;
    familyId++;
  }

  return {
    lines,
    stats: {
      acceptedSeeds: familyId,
      rejectedSeeds,
      totalVertices,
      targetSpacing: options.targetSpacing,
    },
  };
}
