/**
 * 3D Magnetic Field Visualization — Theme-aware
 * Scene background and grid colors respond to CSS --lab-3d-bg
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
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
  
  const copies = Math.round(fieldLineDensity);
  const maxLines = copies * 10;
  
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

  // 用矢量箭头表示磁力线，而不是连续的折线段
  const vectorPlacements: { position: Vec3; direction: THREE.Vector3; fade: number }[] = [];
  
  for (const line of lines) {
    const smoothPoints = smoothLinePoints(line.points, targetSpacing * 0.35);
    // 每隔一段距离放置一个矢量
    const step = Math.max(1, Math.floor(smoothPoints.length / 40));
    
    for (let i = 0; i < smoothPoints.length - 1; i += step) {
      const p = smoothPoints[i];
      const pNext = smoothPoints[Math.min(i + 1, smoothPoints.length - 1)];
      const dir = new THREE.Vector3(pNext[0] - p[0], pNext[1] - p[1], pNext[2] - p[2]);
      if (dir.lengthSq() < 1e-6) continue;
      
      const t = i / (smoothPoints.length - 1);
      const fade = Math.min(1, Math.min(t, 1 - t) * 8);
      
      vectorPlacements.push({
        position: p,
        direction: dir.normalize(),
        fade
      });
    }
  }

  if (vectorPlacements.length > 0) {
    const arrowSize = R * 0.015;
    
    // Create arrow geometry: cylinder + cone
    const cylinderGeo = new THREE.CylinderGeometry(arrowSize * 0.4, arrowSize * 0.4, arrowSize * 3, 5);
    cylinderGeo.translate(0, arrowSize * 1.5, 0);
    const coneGeo = new THREE.ConeGeometry(arrowSize * 1.2, arrowSize * 2, 5);
    coneGeo.translate(0, arrowSize * 3 + arrowSize, 0);
    
    // Merge them together manually using group or just draw them as one geometry, but simplest is to just use standard cone + cylinder geometries inside a group?
    // InstancedMesh only takes one geometry, so we just use ArrowHelper concept geometrically. Let's merge simple buffers.
    // Three.js doesn't easily merge buffers without BufferGeometryUtils, but we can just use 2 InstancedMeshes.
    
    const shaftMat = new THREE.MeshBasicMaterial({ color: baseColor, transparent: true, opacity: isDark ? 0.4 : 0.5 });
    const headMat = new THREE.MeshBasicMaterial({ color: baseColor, transparent: true, opacity: isDark ? 0.6 : 0.7 });
    
    const shafts = new THREE.InstancedMesh(cylinderGeo, shaftMat, vectorPlacements.length);
    const heads = new THREE.InstancedMesh(coneGeo, headMat, vectorPlacements.length);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    vectorPlacements.forEach((placement, i) => {
      dummy.position.set(placement.position[0], placement.position[1], placement.position[2]);
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), placement.direction);
      const scale = 0.5 + 0.5 * placement.fade;
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      
      shafts.setMatrixAt(i, dummy.matrix);
      heads.setMatrixAt(i, dummy.matrix);
      
      color.copy(baseColor).lerp(new THREE.Color(0,0,0), 1 - placement.fade);
      shafts.setColorAt(i, color);
      heads.setColorAt(i, color);
    });
    
    shafts.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    if(shafts.instanceColor) shafts.instanceColor.needsUpdate = true;
    if(heads.instanceColor) heads.instanceColor.needsUpdate = true;
    
    objects.push(shafts, heads);
  }

  return objects;
}

function smoothLinePoints(points: Vec3[], maxSegmentLength: number): Vec3[] {
  const resampled = resampleFieldLine(points, maxSegmentLength);
  if (resampled.length < 4) return resampled;
  const vectors = resampled.map(point => new THREE.Vector3(point[0], point[1], point[2]));
  const closed = vectors[0].distanceTo(vectors[vectors.length - 1]) < maxSegmentLength * 1.2;
  const curve = new THREE.CatmullRomCurve3(vectors, closed, 'centripetal', 0.35);
  const samples = Math.min(480, Math.max(vectors.length * 2, 24));
  return curve.getSpacedPoints(samples).map(point => [point.x, point.y, point.z]);
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

