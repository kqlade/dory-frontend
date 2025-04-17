import React, { useRef, useMemo, useEffect, useState } from 'react';
import { MeshProps, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BALL_CONFIG } from '../config';

/**
 * NodeBall.tsx – Interactive, theme‑aware, draggable sphere component.
 *
 * ✓ Fixes compile‑time type clash with MeshProps.position
 * ✓ Responds to position prop updates
 * ✓ Removes expensive per‑frame getComputedStyle calls
 * ✓ Eliminates origin‑lerp flash and cursor "auto" glitches
 * ✓ Stops entry animation once finished
 */

type NodeBallProps = Omit<MeshProps, 'position'> & {
  position: [number, number, number];
  radius?: number;
  onPositionChange?: (position: THREE.Vector3) => void;
  onDragStateChange?: (dragging: boolean) => void;
  fixedY?: boolean;
  allowDrag?: boolean;
};

const ANIMATION_DURATION = 0.4; // seconds

const NodeBall: React.FC<NodeBallProps> = ({
  position,
  radius = 1,
  onPositionChange,
  onDragStateChange,
  fixedY = false,
  allowDrag = true,
  ...props
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  const [entryAnimating, setEntryAnimating] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);
  const [dragging, setDragging] = useState(false);

  const dragOffset = useRef(new THREE.Vector3());
  const dragPlane = useRef(new THREE.Plane());

  const { camera, size } = useThree();

  // Store current & target positions in refs for smooth lerping
  const currentPosition = useRef(new THREE.Vector3(...position));
  const targetPos = useRef(new THREE.Vector3(...position));

  const originalXRef = useRef(position[0]);

  const animateSnap = (from: THREE.Vector3, to: THREE.Vector3) => {
    const start = performance.now();
    const DURATION = 350; // ms
    const step = () => {
      const t = Math.min((performance.now() - start) / DURATION, 1);
      const eased = 1 - Math.pow(1 - t, 3); // cubic ease-out
      const next = from.clone().lerp(to, eased);
      targetPos.current.copy(next);
      currentPosition.current.copy(next);
      emitPosition(next);
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        onDragStateChange?.(false);
      }
    };
    onDragStateChange?.(true);
    step();
  };

  /* ───────────────────────────────── Position sync ───────────────────────── */
  useEffect(() => {
    currentPosition.current.set(...position);
    targetPos.current.set(...position);
    meshRef.current?.position.copy(targetPos.current);
  }, [position]);

  /* ───────────────────────────── Theming (cached) ────────────────────────── */
  const theme = useMemo(() => {
    const computedStyle = getComputedStyle(document.documentElement);
    const textColor = computedStyle.getPropertyValue('--text-color').trim();
    const isDark = textColor.toLowerCase() === '#ffffff';
    return {
      baseColor: isDark ? '#c7c7c7' : '#000000',
      emissive: isDark ? '#c7c7c7' : '#000000',
    } as const;
  }, []);

  /* ───────────────────────── Initial placement ───────────────────────────── */
  useEffect(() => {
    meshRef.current?.position.copy(targetPos.current);
  }, []);

  const emitPosition = (vec: THREE.Vector3) => onPositionChange?.(vec.clone());

  /* ───────────────────────────── Frame loop ──────────────────────────────── */
  useFrame(({ clock }) => {
    if (!meshRef.current || !materialRef.current) return;

    const { baseColor, emissive } = theme;

    /* Entry animation */
    if (entryAnimating) {
      const elapsed = Math.min(clock.getElapsedTime() / ANIMATION_DURATION, 1);
      const entryScale = 0.8 + 0.2 * elapsed;

      meshRef.current.scale.set(entryScale, entryScale, entryScale);
      materialRef.current.opacity = elapsed;
      materialRef.current.transparent = true;

      if (elapsed >= 1) {
        setEntryAnimating(false);
        materialRef.current.opacity = 1;
        materialRef.current.transparent = false;
        meshRef.current.scale.set(1, 1, 1);
      }
    }

    /* Position lerp */
    meshRef.current.position.lerp(targetPos.current, 0.25);

    /* Hover / click pulse */
    if (hovered || clicked) {
      const pulseTime = clock.getElapsedTime();
      const pulseScale = 1 + 0.03 * Math.sin(pulseTime * 1.8) * (clicked ? 1.2 : 1);
      meshRef.current.scale.set(pulseScale, pulseScale, pulseScale);

      if (clicked) {
        materialRef.current.emissiveIntensity = 0.15 + 0.07 * Math.sin(pulseTime * 2);
        materialRef.current.color.set(theme.baseColor);
        materialRef.current.emissive.set(theme.emissive);
      } else {
        materialRef.current.emissiveIntensity = 0.2 + 0.08 * Math.sin(pulseTime * 1.8);
        materialRef.current.color.set(baseColor);
        materialRef.current.emissive.set(emissive);
      }
    } else {
      materialRef.current.color.set(baseColor);
      materialRef.current.emissive.set(emissive);
      materialRef.current.emissiveIntensity = 1.08;
    }
  });

  /* ─────────────────────────── Event handlers ───────────────────────────── */
  const handlePointerOver = (e: any) => {
    e.stopPropagation();
    setHovered(true);
    if (!dragging) document.body.style.cursor = 'grab';
  };

  const handlePointerOut = (e: any) => {
    e.stopPropagation();
    setHovered(false);
    if (!dragging) document.body.style.cursor = 'default';
  };

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    setClicked(true);
    setDragging(true);
    onDragStateChange?.(true);

    // Offset between mesh centre & click point
    meshRef.current && dragOffset.current.copy(meshRef.current.position).sub(e.point);

    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    // Screen‑parallel drag plane
    const planeNormal = new THREE.Vector3();
    camera.getWorldDirection(planeNormal);
    const planePoint = meshRef.current?.position ?? new THREE.Vector3();
    dragPlane.current.setFromNormalAndCoplanarPoint(planeNormal, planePoint);

    document.body.style.cursor = 'grabbing';
    (document.activeElement as HTMLElement)?.blur();
  };

  const handlePointerMove = (e: any) => {
    if (!dragging) return;
    e.stopPropagation();

    const intersection = new THREE.Vector3();
    if (e.ray.intersectPlane(dragPlane.current, intersection)) {
      const newPos = intersection.clone().add(dragOffset.current);
      if (fixedY) newPos.y = currentPosition.current.y;

      targetPos.current.copy(newPos);
      currentPosition.current.copy(newPos);
      emitPosition(newPos);
    }
  };

  const forbiddenZone = (x: number, y: number): 'header' | 'search' | 'left' | null => {
    const hit = (sel: string) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    if (hit('.app-header') || hit('.subheader')) return 'header';
    if (hit('.home-search-wrapper')) return 'search';
    const sidebar = document.querySelector('.sidebar') as HTMLElement | null;
    if (sidebar) {
      const r = sidebar.getBoundingClientRect();
      const sidebarRight = r.left + r.width;
      if (x <= sidebarRight) return 'left';
    }
    return null;
  };

  const screenYToWorldY = (screenY: number) => {
    const ndcY = 1 - (screenY / size.height) * 2;
    return new THREE.Vector3(0, ndcY, 0).unproject(camera).y;
  };

  const screenXToWorldX = (screenX: number) => {
    const ndcX = (screenX / size.width) * 2 - 1;
    return new THREE.Vector3(ndcX, 0, 0).unproject(camera).x;
  };

  const HORIZONTAL_SEPARATION = BALL_CONFIG.HORIZONTAL_SEPARATION;

  const handlePointerUp = (e: any) => {
    e.stopPropagation();
    setClicked(false);
    setDragging(false);
    const pos = currentPosition.current.clone();
    const zone = forbiddenZone(e.clientX, e.clientY);
    if (zone === 'header') {
      const headerBottom = (document.querySelector('.app-header') as HTMLElement)?.getBoundingClientRect().bottom || 0;
      const radiusPx = radius * camera.zoom; // ensure full sphere clears header/subheader
      const safeYScreen = headerBottom + BALL_CONFIG.SEARCH_SNAP_MARGIN + radiusPx;
      const to = pos.clone();
      to.y = screenYToWorldY(safeYScreen);
      animateSnap(pos, to);
    }
    if (zone === 'search') {
      const bar = document.querySelector('.home-search-wrapper') as HTMLElement | null;
      if (!bar) return;
      const searchTopPx = bar.getBoundingClientRect().top;
      
      // current sphere centre in px
      const currentScreenY = ((1 - pos.clone().project(camera).y) / 2) * size.height;
      const radiusPx = radius * camera.zoom;
      
      // Are we actually intruding?
      const overlapping = currentScreenY + radiusPx > 
                       searchTopPx - BALL_CONFIG.SEARCH_SNAP_MARGIN;
      
      if (overlapping) {
        const safeWorldY = screenYToWorldY(
          searchTopPx - BALL_CONFIG.SEARCH_SNAP_MARGIN - radiusPx
        );
        const to = pos.clone();
        to.y = safeWorldY;
        animateSnap(pos, to);
      }
    }
    if (zone === 'left') {
      const sidebar = document.querySelector('.sidebar') as HTMLElement;
      const sidebarRightPx = sidebar.getBoundingClientRect().right;
      const sidebarWorldX = screenXToWorldX(sidebarRightPx);
      const marginWorld = BALL_CONFIG.SIDEBAR_SNAP_MARGIN / camera.zoom;
      const to = pos.clone();
      to.x = sidebarWorldX + marginWorld;
      animateSnap(pos, to);
    }
    if (zone) {
      onDragStateChange?.(false);
    } else {
      onDragStateChange?.(false);
    }
    document.body.style.cursor = hovered ? 'grab' : 'default';
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  /* ───────────────────────────────── Render ─────────────────────────────── */
  return (
    <mesh
      ref={meshRef}
      position={position}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      {...props}
    >
      <sphereGeometry args={[radius, 64, 64]} />
      <meshStandardMaterial
        ref={materialRef}
        roughness={0.3}
        metalness={0.1}
        emissiveIntensity={0.15}
        opacity={0}
        transparent
      />
    </mesh>
  );
};

export default NodeBall;
