/**
 * 3D Magnetic Field Visualization — Theme-aware
 * Scene background and grid colors respond to CSS --lab-3d-bg
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { useTheme } from '@/contexts/ThemeContext';
import { generateSymmetricFieldLines, resampleFieldLine } from '@/lib/fieldLines';
import {
  CoilParams,
  generateCoilSegments,
  calculateBField,
  calculateSelfInductance,
  calculateMutualInductance,
  calculateFlux,
  Vec3,
} from '@/lib/physics';

interface MagneticFieldViewerProps {
  coil1: CoilParams;
  coil2: CoilParams | null;
  gridSize: number;
  showFieldArrows: boolean;
  showFieldLines: boolean;
  fieldThreshold: number;
  fieldLineWidth: number;
  fieldLineDensity: number;
  onPhysicsUpdate?: (data: PhysicsData) => void;
}

export interface PhysicsData {
  L1: number;
  L2: number;
  M: number;
  k: number;
  flux: number;
  maxB: number;
}

const DARK_SURFACE = 0x191a1b;
const DARK_GRID = 0x5f6366;
const DARK_LINE = 0xd8d8d8;

function getFieldColor(ratio: number, isDark = false): [number, number, number] {
  if (isDark) {
    const v = 0.42 + Math.min(Math.max(ratio, 0), 1) * 0.46;
    return [v, v, v];
  }

  if (ratio < 0.25) {
    const t = ratio / 0.25;
    return [0.1, 0.2 + t * 0.6, 0.8 + t * 0.2];
  } else if (ratio < 0.5) {
    const t = (ratio - 0.25) / 0.25;
    return [0.1 + t * 0.2, 0.8, 1.0 - t * 0.5];
  } else if (ratio < 0.75) {
    const t = (ratio - 0.5) / 0.25;
    return [0.3 + t * 0.6, 0.8 - t * 0.2, 0.5 - t * 0.4];
  } else {
    const t = (ratio - 0.75) / 0.25;
    return [0.9 + t * 0.1, 0.6 - t * 0.4, 0.1];
  }
}

export default function MagneticFieldViewer({
  coil1, coil2, gridSize, showFieldArrows, showFieldLines, fieldThreshold,
  fieldLineWidth, fieldLineDensity, onPhysicsUpdate,
}: MagneticFieldViewerProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animFrameRef = useRef<number>(0);
  const objectsRef = useRef<THREE.Object3D[]>([]);
  const staticObjectsRef = useRef<THREE.Object3D[]>([]);
  const [isComputing, setIsComputing] = useState(false);

  // Initialize Three.js scene (once)
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isDark ? DARK_SURFACE : 0xe8edf4);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.001, 100);
    camera.position.set(0.35, 0.25, 0.35);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.05;
    controls.maxDistance = 5;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(isDark ? 0x6f6f6f : 0x8899aa, isDark ? 1.15 : 1.5));
    const dirLight = new THREE.DirectionalLight(isDark ? 0xe6e6e6 : 0xffffff, isDark ? 0.85 : 1.0);
    dirLight.position.set(1, 2, 1);
    scene.add(dirLight);
    const pointLight = new THREE.PointLight(isDark ? 0xb8b8b8 : 0x88aacc, 0.5, 3);
    pointLight.position.set(-0.5, 0.5, 0.5);
    scene.add(pointLight);

    createGrid(scene, isDark);

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      updateWideLineResolution(objectsRef.current, w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animFrameRef.current);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [isDark]);

  // Update field
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    setIsComputing(true);

    for (const obj of objectsRef.current) {
      scene.remove(obj);
      disposeObject3D(obj);
    }
    objectsRef.current = [];

    const coils: CoilParams[] = [coil1];
    if (coil2) coils.push(coil2);

    for (const coil of coils) {
      const group = createCoilMesh(coil, isDark);
      scene.add(group);
      objectsRef.current.push(group);
    }

    const extent = Math.max(coil1.radius * 3, coil2 ? Math.abs(coil2.position[2]) + coil2.radius * 2 : 0.2, 0.25);
    const viewport = {
      width: containerRef.current?.clientWidth ?? 1,
      height: containerRef.current?.clientHeight ?? 1,
    };

    if (showFieldArrows || showFieldLines) {
      const fieldObjects = renderField(
        coils,
        gridSize,
        extent,
        showFieldArrows,
        showFieldLines,
        fieldThreshold,
        isDark,
        viewport,
        fieldLineWidth,
        fieldLineDensity
      );
      for (const obj of fieldObjects) {
        scene.add(obj);
        objectsRef.current.push(obj);
      }
    }

    const L1 = calculateSelfInductance(coil1.radius, coil1.turns, coil1.pitch);
    let L2 = 0, M = 0, k = 0, flux = 0, maxB = 0;
    if (coil2) {
      L2 = calculateSelfInductance(coil2.radius, coil2.turns, coil2.pitch);
      M = calculateMutualInductance(coil1, coil2, 48);
      if (Math.abs(coil1.current) > 1e-10) flux = calculateFlux(coil1, coil2, 10, 48);
      if (L1 > 0 && L2 > 0) k = Math.min(Math.abs(M) / Math.sqrt(L1 * L2), 1);
    }
    const Bcenter = calculateBField([0, 0, 0], coil1, 64);
    maxB = Math.sqrt(Bcenter[0] ** 2 + Bcenter[1] ** 2 + Bcenter[2] ** 2);
    onPhysicsUpdate?.({ L1, L2, M, k, flux, maxB });
    setIsComputing(false);
  }, [coil1, coil2, gridSize, showFieldArrows, showFieldLines, fieldThreshold, fieldLineWidth, fieldLineDensity, isDark]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {isComputing && (
        <div className="absolute top-3 right-3 flex items-center gap-2 px-3 py-1.5 rounded panel text-xs led-display">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--lab-secondary)' }} />
          计算中...
        </div>
      )}
      <div className="absolute bottom-3 left-3 text-[10px] font-mono t-muted-soft">
        拖拽旋转 | 滚轮缩放 | 右键平移
      </div>
    </div>
  );
}

function createGrid(scene: THREE.Scene, isDark: boolean) {
  const gridColor = isDark ? DARK_GRID : 0x3b82f6;
  const gridOpacity = isDark ? 0.12 : 0.12;
  const gridMat = new THREE.LineBasicMaterial({ color: gridColor, transparent: true, opacity: gridOpacity });
  const gridSize = 1;
  const divisions = 20;
  const half = gridSize / 2;
  const step = gridSize / divisions;

  const gridGeo = new THREE.BufferGeometry();
  const pts: number[] = [];
  for (let i = 0; i <= divisions; i++) {
    const pos = -half + i * step;
    pts.push(pos, 0, -half, pos, 0, half);
    pts.push(-half, 0, pos, half, 0, pos);
  }
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.LineSegments(gridGeo, gridMat));

  const axisLen = 0.4;
  const axisGeo = new THREE.BufferGeometry();
  axisGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, axisLen, 0, 0,
    0, 0, 0, 0, axisLen, 0,
    0, 0, 0, 0, 0, axisLen,
  ], 3));
  const axisColors = isDark
    ? [0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.72, 0.72, 0.72, 0.72, 0.72, 0.72, 0.56, 0.56, 0.56, 0.56, 0.56, 0.56]
    : [0.9, 0.2, 0.2, 0.9, 0.2, 0.2, 0.15, 0.6, 0.3, 0.15, 0.6, 0.3, 0.2, 0.4, 0.8, 0.2, 0.4, 0.8];
  axisGeo.setAttribute('color', new THREE.Float32BufferAttribute(axisColors, 3));
  scene.add(new THREE.LineSegments(axisGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 })));

  const tipGeo = new THREE.SphereGeometry(0.006, 8, 8);
  const xTip = new THREE.Mesh(tipGeo, new THREE.MeshBasicMaterial({ color: isDark ? 0xe5e5e5 : 0xdc2626 }));
  xTip.position.set(axisLen, 0, 0);
  scene.add(xTip);
  const yTip = new THREE.Mesh(tipGeo.clone(), new THREE.MeshBasicMaterial({ color: isDark ? 0xb8b8b8 : 0x16a34a }));
  yTip.position.set(0, axisLen, 0);
  scene.add(yTip);
  const zTip = new THREE.Mesh(tipGeo.clone(), new THREE.MeshBasicMaterial({ color: isDark ? 0x8f8f8f : 0x2563eb }));
  zTip.position.set(0, 0, axisLen);
  scene.add(zTip);
}

function createCoilMesh(coil: CoilParams, isDark: boolean): THREE.Group {
  const group = new THREE.Group();
  const segments = generateCoilSegments(coil, 128);
  if (segments.length < 2) return group;

  const points = segments.map(s => new THREE.Vector3(s.pos[0], s.pos[1], s.pos[2]));
  if (coil.turns === 1) points.push(points[0].clone());
  const curve = new THREE.CatmullRomCurve3(points, coil.turns === 1);
  const wireRadius = Math.min(coil.radius * 0.05, 0.006);
  const tubeGeo = new THREE.TubeGeometry(curve, Math.min(segments.length, 256), wireRadius, 8, coil.turns === 1);

  const color = isDark
    ? new THREE.Color(coil.current >= 0 ? 0xd0d0d0 : 0x8a8a8a)
    : coil.current >= 0
      ? new THREE.Color(0.95, 0.6, 0.2)
      : new THREE.Color(0.3, 0.7, 0.95);

  group.add(new THREE.Mesh(tubeGeo, new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.4, metalness: 0.7, roughness: 0.3,
  })));
  group.add(new THREE.Mesh(
    new THREE.TubeGeometry(curve, Math.min(segments.length, 128), wireRadius * 3, 6, coil.turns === 1),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12 })
  ));
  return group;
}

function renderField(
  coils: CoilParams[], gridSize: number, extent: number,
  showArrows: boolean, showLines: boolean, threshold: number, isDark: boolean,
  viewport: { width: number; height: number },
  fieldLineWidth: number,
  fieldLineDensity: number
): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];
  const step = (2 * extent) / (gridSize - 1);
  interface FieldPoint { pos: Vec3; B: Vec3; mag: number }
  const fieldData: FieldPoint[] = [];
  let maxB = 0;

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
          const B = calculateBField(point, coil, 32);
          Bx += B[0]; By += B[1]; Bz += B[2];
        }
        const mag = Math.sqrt(Bx * Bx + By * By + Bz * Bz);
        if (mag > maxB) maxB = mag;
        fieldData.push({ pos: point, B: [Bx, By, Bz], mag });
      }
    }
  }

  if (maxB < 1e-15) return objects;

  if (showArrows) {
    const filtered = fieldData.filter(f => f.mag > maxB * threshold);
    const count = Math.min(filtered.length, 3000);
    filtered.sort((a, b) => b.mag - a.mag);
    const displayed = filtered.slice(0, count);

    const arrowGeo = new THREE.ConeGeometry(0.004, 0.015, 5);
    arrowGeo.translate(0, 0.0075, 0);
    const mesh = new THREE.InstancedMesh(arrowGeo, new THREE.MeshPhongMaterial({
      shininess: 30, transparent: true, opacity: 0.9,
    }), count);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const f = displayed[i];
      const ratio = f.mag / maxB;
      dummy.position.set(f.pos[0], f.pos[1], f.pos[2]);
      const dir = new THREE.Vector3(f.B[0], f.B[1], f.B[2]).normalize();
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const scale = 0.4 + ratio * 1.2;
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const [r, g, b] = getFieldColor(ratio, isDark);
      color.setRGB(r, g, b);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    objects.push(mesh);
  }

  if (showLines) {
    const fieldLineObjects = renderFieldLinesSymmetric(coils, extent, isDark, viewport, fieldLineWidth, fieldLineDensity);
    objects.push(...fieldLineObjects);
  }

  return objects;
}

function renderFieldLinesSymmetric(
  coils: CoilParams[], extent: number, isDark: boolean, viewport: { width: number; height: number },
  fieldLineWidth: number, fieldLineDensity: number
): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];
  const R = Math.max(...coils.map(coil => coil.radius));
  const targetSpacing = Math.min(Math.max(extent * 0.075, R * 0.08), R * 0.22);
  
  const copies = Math.min(12, Math.max(6, Math.round(fieldLineDensity / 4)));
  const maxLines = Math.max(copies, Math.round(fieldLineDensity));
  
  const { lines } = generateSymmetricFieldLines(coils, {
    extent,
    targetSpacing,
    maxLines,
    maxSteps: 900,
    minAcceptedSamples: 16,
    minFieldMagnitude: 1e-15,
    boundaryExtent: extent * 1.8,
    maxVertices: copies * 5000,
    copies,
    radialSeedCount: Math.max(3, Math.round(copies / 3)),
    zSeedLevels: 3,
  });

  const lineColor = isDark ? DARK_LINE : 0x0ea5e9;
  const baseColor = new THREE.Color(lineColor);

  // 用矢量图（平滑线）表示磁力线，并使用大量采样使之放大不成为折线
  for (const line of lines) {
    const smoothPoints = smoothLinePoints(line.points, targetSpacing * 0.35);
    const positions: number[] = [];
    const colors: number[] = [];

    for (let i = 0; i < smoothPoints.length; i++) {
      const p = smoothPoints[i];
      positions.push(p[0], p[1], p[2]);

      const t = i / (smoothPoints.length - 1);
      const fade = Math.min(1, Math.min(t, 1 - t) * 8);
      colors.push(
        baseColor.r * (0.3 + 0.7 * fade),
        baseColor.g * (0.3 + 0.7 * fade),
        baseColor.b * (0.3 + 0.7 * fade)
      );
    }

    const geo = new LineGeometry();
    geo.setPositions(positions);
    geo.setColors(colors);
    const mat = new LineMaterial({
      color: baseColor,
      vertexColors: true,
      transparent: true,
      opacity: isDark ? 0.55 : 0.65,
      worldUnits: false, // 保持在屏幕空间的像素宽度，表现出矢量图线条一样的效果
      resolution: new THREE.Vector2(viewport.width, viewport.height),
      linewidth: fieldLineWidth,
    } as ConstructorParameters<typeof LineMaterial>[0] & { linewidth: number });
    const wideLine = new Line2(geo, mat);
    wideLine.computeLineDistances();
    objects.push(wideLine);
  }

  // 给磁感线附加少量箭头指示方向
  const arrowPlacements: { position: Vec3; direction: THREE.Vector3 }[] = [];
  for (const line of lines) {
    for (const idx of line.arrowIndices) {
      if (idx >= line.points.length - 1) continue;
      const p = line.points[idx];
      const pNext = line.points[Math.min(idx + 2, line.points.length - 1)];
      const tangent = new THREE.Vector3(pNext[0] - p[0], pNext[1] - p[1], pNext[2] - p[2]).normalize();
      const dir = totalFieldDirectionAt(p, coils) ?? tangent;
      if (dir.dot(tangent) < 0) dir.multiplyScalar(-1);
      if (dir.length() < 0.5) continue;
      arrowPlacements.push({ position: p, direction: dir });
    }
  }

  if (arrowPlacements.length > 0) {
    const arrowSize = R * 0.02;
    const coneGeo = new THREE.ConeGeometry(arrowSize, arrowSize * 2.5, 4);
    coneGeo.translate(0, arrowSize * 1.25, 0);
    const arrowMat = new THREE.MeshBasicMaterial({ color: baseColor, transparent: true, opacity: isDark ? 0.7 : 0.8 });
    const arrows = new THREE.InstancedMesh(coneGeo, arrowMat, arrowPlacements.length);
    const dummy = new THREE.Object3D();

    arrowPlacements.forEach((placement, i) => {
      dummy.position.set(placement.position[0], placement.position[1], placement.position[2]);
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), placement.direction);
      dummy.updateMatrix();
      arrows.setMatrixAt(i, dummy.matrix);
    });
    arrows.instanceMatrix.needsUpdate = true;
    objects.push(arrows);
  }

  return objects;
}

function smoothLinePoints(points: Vec3[], targetSpacing: number): Vec3[] {
  if (points.length < 4) return points;

  const deduped: Vec3[] = [];
  const minDistance = Math.max(targetSpacing * 0.02, 1e-5);
  for (const point of points) {
    const previous = deduped[deduped.length - 1];
    if (previous) {
      const dx = point[0] - previous[0];
      const dy = point[1] - previous[1];
      const dz = point[2] - previous[2];
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) < minDistance) {
        continue;
      }
    }
    deduped.push(point);
  }

  if (deduped.length < 2) return deduped;

  return resampleFieldLine(deduped, targetSpacing);
}

function totalFieldDirectionAt(point: Vec3, coils: CoilParams[]): THREE.Vector3 | null {
  let bx = 0;
  let by = 0;
  let bz = 0;
  for (const coil of coils) {
    if (Math.abs(coil.current) < 1e-10) continue;
    const B = calculateBField(point, coil, 48);
    bx += B[0];
    by += B[1];
    bz += B[2];
  }

  const dir = new THREE.Vector3(bx, by, bz);
  if (dir.length() < 1e-15) return null;
  return dir.normalize();
}

function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse(child => {
    const maybeGeometry = (child as { geometry?: { dispose?: () => void } }).geometry;
    maybeGeometry?.dispose?.();
    const maybeMaterial = (child as { material?: THREE.Material | THREE.Material[] }).material;
    if (Array.isArray(maybeMaterial)) {
      maybeMaterial.forEach(material => material.dispose());
    } else {
      maybeMaterial?.dispose();
    }
  });
}

function updateWideLineResolution(objects: THREE.Object3D[], width: number, height: number) {
  for (const obj of objects) {
    obj.traverse(child => {
      const material = (child as { material?: unknown }).material;
      if (material instanceof LineMaterial) {
        material.resolution.set(width, height);
      }
    });
  }
}
