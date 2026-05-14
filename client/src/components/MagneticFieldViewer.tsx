/**
 * 3D Magnetic Field Visualization — Theme-aware
 * Scene background and grid colors respond to CSS --lab-3d-bg
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useTheme } from '@/contexts/ThemeContext';
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

function getFieldColor(ratio: number): [number, number, number] {
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
  coil1, coil2, gridSize, showFieldArrows, showFieldLines, fieldThreshold, onPhysicsUpdate,
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
    scene.background = new THREE.Color(isDark ? 0x0a1628 : 0xe8edf4);
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

    scene.add(new THREE.AmbientLight(isDark ? 0x1a3a5a : 0x8899aa, isDark ? 1.0 : 1.5));
    const dirLight = new THREE.DirectionalLight(isDark ? 0x4fd1c5 : 0xffffff, isDark ? 0.8 : 1.0);
    dirLight.position.set(1, 2, 1);
    scene.add(dirLight);
    const pointLight = new THREE.PointLight(isDark ? 0x63b3ed : 0x88aacc, 0.5, 3);
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
      if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
        obj.geometry.dispose();
        if (obj.material instanceof THREE.Material) obj.material.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
      }
      if (obj instanceof THREE.Line) {
        obj.geometry.dispose();
        if (obj.material instanceof THREE.Material) obj.material.dispose();
      }
      if (obj instanceof THREE.Group) {
        obj.traverse(child => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (child.material instanceof THREE.Material) child.material.dispose();
          }
        });
      }
    }
    objectsRef.current = [];

    const coils: CoilParams[] = [coil1];
    if (coil2) coils.push(coil2);

    for (const coil of coils) {
      const group = createCoilMesh(coil);
      scene.add(group);
      objectsRef.current.push(group);
    }

    const extent = Math.max(coil1.radius * 3, coil2 ? Math.abs(coil2.position[2]) + coil2.radius * 2 : 0.2, 0.25);

    if (showFieldArrows || showFieldLines) {
      const fieldObjects = renderField(coils, gridSize, extent, showFieldArrows, showFieldLines, fieldThreshold, isDark);
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
  }, [coil1, coil2, gridSize, showFieldArrows, showFieldLines, fieldThreshold, isDark]);

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
  const gridColor = isDark ? 0x4fd1c5 : 0x3b82f6;
  const gridOpacity = isDark ? 0.06 : 0.12;
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
    ? [1, 0.3, 0.3, 1, 0.3, 0.3, 0.3, 0.8, 0.4, 0.3, 0.8, 0.4, 0.4, 0.7, 1, 0.4, 0.7, 1]
    : [0.9, 0.2, 0.2, 0.9, 0.2, 0.2, 0.15, 0.6, 0.3, 0.15, 0.6, 0.3, 0.2, 0.4, 0.8, 0.2, 0.4, 0.8];
  axisGeo.setAttribute('color', new THREE.Float32BufferAttribute(axisColors, 3));
  scene.add(new THREE.LineSegments(axisGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 })));

  const tipGeo = new THREE.SphereGeometry(0.006, 8, 8);
  const xTip = new THREE.Mesh(tipGeo, new THREE.MeshBasicMaterial({ color: isDark ? 0xfc8181 : 0xdc2626 }));
  xTip.position.set(axisLen, 0, 0);
  scene.add(xTip);
  const yTip = new THREE.Mesh(tipGeo.clone(), new THREE.MeshBasicMaterial({ color: isDark ? 0x48bb78 : 0x16a34a }));
  yTip.position.set(0, axisLen, 0);
  scene.add(yTip);
  const zTip = new THREE.Mesh(tipGeo.clone(), new THREE.MeshBasicMaterial({ color: isDark ? 0x63b3ed : 0x2563eb }));
  zTip.position.set(0, 0, axisLen);
  scene.add(zTip);
}

function createCoilMesh(coil: CoilParams): THREE.Group {
  const group = new THREE.Group();
  const segments = generateCoilSegments(coil, 128);
  if (segments.length < 2) return group;

  const points = segments.map(s => new THREE.Vector3(s.pos[0], s.pos[1], s.pos[2]));
  if (coil.turns === 1) points.push(points[0].clone());
  const curve = new THREE.CatmullRomCurve3(points, coil.turns === 1);
  const wireRadius = Math.min(coil.radius * 0.05, 0.006);
  const tubeGeo = new THREE.TubeGeometry(curve, Math.min(segments.length, 256), wireRadius, 8, coil.turns === 1);

  const color = coil.current >= 0
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
  showArrows: boolean, showLines: boolean, threshold: number, isDark: boolean
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
      const [r, g, b] = getFieldColor(ratio);
      color.setRGB(r, g, b);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    objects.push(mesh);
  }

  if (showLines) {
    const fieldLineObjects = renderFieldLinesSymmetric(coils, extent, step, isDark);
    objects.push(...fieldLineObjects);
  }

  return objects;
}

/* ===================================================================
 * PHYSICALLY CORRECT MAGNETIC FIELD LINE RENDERING
 *
 * Strategy: Exploit the axial symmetry of a circular current loop.
 *
 * For a single coil lying in the xy-plane centred at the origin,
 * the B-field is rotationally symmetric about the z-axis.
 * Therefore every field line in one meridional half-plane (e.g. the
 * xz-plane, x >= 0) can be rotated around the z-axis to produce
 * identical copies at any azimuthal angle.
 *
 * Steps:
 *   1. Place seed points in the xz-plane at several radial distances
 *      from the axis (slightly above the coil plane).
 *   2. Trace each seed with high-precision RK4 in the xz-plane
 *      (using high segment count for Biot-Savart to minimise
 *      discretisation error).
 *   3. Rotate the resulting 2-D curve around the z-axis N times
 *      to produce the full 3-D field-line family.
 *
 * This guarantees every azimuthal copy is *exactly* the same shape
 * and size, matching the true rotational symmetry of the physics.
 *
 * For dual-coil (coaxial) setups the same symmetry holds as long
 * as both coils share the same axis, which is the case here.
 * =================================================================== */

/**
 * Compute total B field at a point from all coils.
 * Uses a high segment count for accuracy.
 */
function computeTotalB(pos: Vec3, coils: CoilParams[], segPerTurn: number = 128): Vec3 {
  let Bx = 0, By = 0, Bz = 0;
  for (const coil of coils) {
    if (Math.abs(coil.current) < 1e-10) continue;
    const B = calculateBField(pos, coil, segPerTurn);
    Bx += B[0]; By += B[1]; Bz += B[2];
  }
  return [Bx, By, Bz];
}

/**
 * Trace a field line using 4th-order Runge-Kutta in the FULL 3-D space.
 * We start in the xz-plane but the tracer is general.
 * High segPerTurn (128) ensures the B-field is nearly rotationally
 * symmetric so the line stays in the meridional plane.
 */
function traceFieldLineRK4(
  start: Vec3, coils: CoilParams[], extent: number,
  maxSteps: number, stepSize: number, direction: 1 | -1
): Vec3[] {
  const points: Vec3[] = [[...start]];
  let pos: Vec3 = [...start];
  const minMag = 1e-15;
  const segPerTurn = 128; // High accuracy

  for (let i = 0; i < maxSteps; i++) {
    // k1
    const B1 = computeTotalB(pos, coils, segPerTurn);
    const m1 = Math.sqrt(B1[0] ** 2 + B1[1] ** 2 + B1[2] ** 2);
    if (m1 < minMag) break;
    const k1: Vec3 = [direction * B1[0] / m1, direction * B1[1] / m1, direction * B1[2] / m1];

    // k2
    const p2: Vec3 = [pos[0] + 0.5 * stepSize * k1[0], pos[1] + 0.5 * stepSize * k1[1], pos[2] + 0.5 * stepSize * k1[2]];
    const B2 = computeTotalB(p2, coils, segPerTurn);
    const m2 = Math.sqrt(B2[0] ** 2 + B2[1] ** 2 + B2[2] ** 2);
    if (m2 < minMag) break;
    const k2: Vec3 = [direction * B2[0] / m2, direction * B2[1] / m2, direction * B2[2] / m2];

    // k3
    const p3: Vec3 = [pos[0] + 0.5 * stepSize * k2[0], pos[1] + 0.5 * stepSize * k2[1], pos[2] + 0.5 * stepSize * k2[2]];
    const B3 = computeTotalB(p3, coils, segPerTurn);
    const m3 = Math.sqrt(B3[0] ** 2 + B3[1] ** 2 + B3[2] ** 2);
    if (m3 < minMag) break;
    const k3: Vec3 = [direction * B3[0] / m3, direction * B3[1] / m3, direction * B3[2] / m3];

    // k4
    const p4: Vec3 = [pos[0] + stepSize * k3[0], pos[1] + stepSize * k3[1], pos[2] + stepSize * k3[2]];
    const B4 = computeTotalB(p4, coils, segPerTurn);
    const m4 = Math.sqrt(B4[0] ** 2 + B4[1] ** 2 + B4[2] ** 2);
    if (m4 < minMag) break;
    const k4: Vec3 = [direction * B4[0] / m4, direction * B4[1] / m4, direction * B4[2] / m4];

    // RK4 combine
    pos = [
      pos[0] + (stepSize / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
      pos[1] + (stepSize / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
      pos[2] + (stepSize / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])
    ];

    // Boundary check
    if (Math.abs(pos[0]) > extent || Math.abs(pos[1]) > extent || Math.abs(pos[2]) > extent) break;

    // Loop closure detection
    const d = Math.sqrt((pos[0] - start[0]) ** 2 + (pos[1] - start[1]) ** 2 + (pos[2] - start[2]) ** 2);
    if (i > 30 && d < stepSize * 1.5) {
      points.push([...start]); // close the loop exactly
      break;
    }

    points.push([...pos]);
  }
  return points;
}

/**
 * Rotate a 3-D point around the z-axis by angle phi.
 */
function rotateAroundZ(p: Vec3, cosPhi: number, sinPhi: number, cx: number, cy: number): Vec3 {
  const dx = p[0] - cx;
  const dy = p[1] - cy;
  return [cx + dx * cosPhi - dy * sinPhi, cy + dx * sinPhi + dy * cosPhi, p[2]];
}

/**
 * Main renderer: trace field lines in the meridional plane,
 * then rotate copies around the coil axis.
 */
function renderFieldLinesSymmetric(
  coils: CoilParams[], extent: number, gridStep: number, isDark: boolean
): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];
  const R = coils[0].radius;
  const cx = coils[0].position[0];
  const cy = coils[0].position[1];
  const cz = coils[0].position[2];

  // --- 1. Define seed radii in the meridional (xz) plane ---
  // Seeds are placed at (cx + r, cy, cz + small_offset) so they
  // lie in the xz-plane through the coil centre.
  const seedRadii = [0.15 * R, 0.35 * R, 0.55 * R, 0.75 * R, 0.92 * R];
  const zOffset = R * 0.04; // small offset above coil plane
  const stepSize = R * 0.03;
  const maxSteps = 1200;
  const boundaryExtent = extent * 1.8;

  // --- 2. Trace ONE canonical line per seed radius ---
  interface TracedLine { points: Vec3[]; seedR: number }
  const canonicalLines: TracedLine[] = [];

  for (const r of seedRadii) {
    const seed: Vec3 = [cx + r, cy, cz + zOffset];
    const fwd = traceFieldLineRK4(seed, coils, boundaryExtent, maxSteps, stepSize, 1);
    const bwd = traceFieldLineRK4(seed, coils, boundaryExtent, maxSteps, stepSize, -1);
    const all = [...bwd.reverse(), ...fwd];
    if (all.length < 10) continue;
    canonicalLines.push({ points: all, seedR: r });
  }

  // --- 3. Rotate each canonical line around the z-axis ---
  const numCopies = 6; // azimuthal copies
  const lineColor = isDark ? 0x4fd1c5 : 0x0e6f9e;

  for (const line of canonicalLines) {
    for (let k = 0; k < numCopies; k++) {
      const phi = (k / numCopies) * 2 * Math.PI;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);

      const positions: number[] = [];
      const colors: number[] = [];
      const baseColor = new THREE.Color(lineColor);

      for (let i = 0; i < line.points.length; i++) {
        const rotated = rotateAroundZ(line.points[i], cosPhi, sinPhi, cx, cy);
        positions.push(rotated[0], rotated[1], rotated[2]);

        // Smooth fade at endpoints
        const t = i / (line.points.length - 1);
        const fade = Math.min(1, Math.min(t, 1 - t) * 8);
        colors.push(baseColor.r * (0.3 + 0.7 * fade), baseColor.g * (0.3 + 0.7 * fade), baseColor.b * (0.3 + 0.7 * fade));
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const mat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: isDark ? 0.55 : 0.65,
      });
      objects.push(new THREE.Line(geo, mat));
    }
  }

  // --- 4. Direction arrows (placed on a subset of rotated lines) ---
  const arrowColor = new THREE.Color(isDark ? 0x4fd1c5 : 0x0e6f9e);
  const arrowSize = R * 0.02;
  const coneGeo = new THREE.ConeGeometry(arrowSize, arrowSize * 2.5, 4);
  coneGeo.translate(0, arrowSize * 1.25, 0);
  const arrowMat = new THREE.MeshBasicMaterial({ color: arrowColor, transparent: true, opacity: isDark ? 0.7 : 0.8 });

  for (const line of canonicalLines) {
    // Place arrows only on 2 azimuthal copies to avoid clutter
    for (let k = 0; k < numCopies; k += 3) {
      const phi = (k / numCopies) * 2 * Math.PI;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);

      const pts = line.points;
      if (pts.length < 40) continue;
      const interval = Math.floor(pts.length / 5);
      for (let j = 1; j <= 4; j++) {
        const idx = j * interval;
        if (idx >= pts.length - 1) continue;
        const p = rotateAroundZ(pts[idx], cosPhi, sinPhi, cx, cy);
        const pNext = rotateAroundZ(pts[Math.min(idx + 2, pts.length - 1)], cosPhi, sinPhi, cx, cy);
        const dir = new THREE.Vector3(pNext[0] - p[0], pNext[1] - p[1], pNext[2] - p[2]).normalize();
        if (dir.length() < 0.5) continue;
        const arrow = new THREE.Mesh(coneGeo, arrowMat);
        arrow.position.set(p[0], p[1], p[2]);
        arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        objects.push(arrow);
      }
    }
  }

  return objects;
}
