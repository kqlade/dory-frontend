import React, { useMemo, useRef, useEffect, useState } from 'react';
import { MeshProps, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BALL_CONFIG } from '../config';

/**
 * AnchorBall.tsx – Accent‑coloured, draggable anchor sphere.
 * Mirrors NodeBall's fixes: typesafety, prop‑sync, cached theming, and
 * robust drag with pointer‑capture + screen‑parallel plane.
 */

type AnchorBallProps = Omit<MeshProps, 'position'> & {
  position: [number, number, number];
  radius?: number;
  onPositionChange?: (position: THREE.Vector3) => void;
  onDragStateChange?: (dragging: boolean) => void;
  fixedY?: boolean;
  allowDrag?: boolean;
};

const ANIMATION_DURATION = 0.4; // s

const AnchorBall: React.FC<AnchorBallProps> = ({
  position,
  radius = BALL_CONFIG.ANCHOR_RADIUS,
  onPositionChange,
  onDragStateChange,
  fixedY = false,
  allowDrag = true,
  ...props
}) => {
  /* ─────────────────────────── Refs & state ───────────────────────────── */
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  const [entryAnimating, setEntryAnimating] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);
  const [dragging, setDragging] = useState(false);

  const dragOffset = useRef(new THREE.Vector3());
  const dragPlane = useRef(new THREE.Plane());

  const { camera, size } = useThree();

  const currentPosition = useRef(new THREE.Vector3(...position));
  const targetPos = useRef(new THREE.Vector3(...position));
  const originalXRef = useRef(position[0]);

  /* ─────────────────────────── Theme (cached) ──────────────────────────── */
  const theme = useMemo(() => {
    const color = new THREE.Color('#00c8e6');
    return {
      baseColor: '#00c8e6',
      emissive: '#00c8e6',
    } as const;
  }, []);

  /* ─────────────────────── Sync external position prop ─────────────────── */
  useEffect(() => {
    currentPosition.current.set(...position);
    targetPos.current.set(...position);
    meshRef.current?.position.copy(targetPos.current);
  }, [position]);

  /* ───────────────────────── Initial placement ─────────────────────────── */
  useEffect(() => {
    meshRef.current?.position.copy(targetPos.current);
  }, []);

  const emitPosition = (v: THREE.Vector3) => onPositionChange?.(v.clone());

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

  /* ───────────────────────────── useFrame loop ─────────────────────────── */
  useFrame(({ clock }) => {
    if (!meshRef.current || !materialRef.current) return;

    const { baseColor, emissive } = theme;

    /* Entry animation */
    if (entryAnimating) {
      const t = Math.min(clock.getElapsedTime() / ANIMATION_DURATION, 1);
      const scale = 0.8 + 0.2 * t;

      meshRef.current.scale.set(scale, scale, scale);
      materialRef.current.opacity = t;
      materialRef.current.transparent = true;

      if (t >= 1) {
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
      const time = clock.getElapsedTime();
      const pulse = 1 + 0.03 * Math.sin(time * 1.8) * (clicked ? 1.2 : 1);
      meshRef.current.scale.set(pulse, pulse, pulse);

      if (clicked) {
        materialRef.current.emissiveIntensity = 0.15 + 0.07 * Math.sin(time * 2);
        materialRef.current.color.set(baseColor);
        materialRef.current.emissive.set(emissive);
      } else {
        materialRef.current.emissiveIntensity = 0.2 + 0.08 * Math.sin(time * 1.8);
        materialRef.current.color.set(baseColor);
        materialRef.current.emissive.set(emissive);
      }
    } else {
      materialRef.current.color.set(theme.baseColor);
      materialRef.current.emissive.set(theme.emissive);
      materialRef.current.emissiveIntensity = 1.08;
    }
  });

  /* ─────────────────────────── Handlers (shared) ───────────────────────── */
  const onOver = (e: any) => {
    e.stopPropagation();
    setHovered(true);
    if (!dragging) document.body.style.cursor = 'grab';
  };

  const onOut = (e: any) => {
    e.stopPropagation();
    setHovered(false);
    if (!dragging) document.body.style.cursor = 'default';
  };

  const onDown = (e: any) => {
    e.stopPropagation();
    setClicked(true);
    (document.activeElement as HTMLElement)?.blur();

    if (!allowDrag) return;
    setDragging(true);
    onDragStateChange?.(true);
    meshRef.current && dragOffset.current.copy(meshRef.current.position).sub(e.point);

    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    // Build screen‑parallel plane
    const normal = new THREE.Vector3();
    camera.getWorldDirection(normal);
    dragPlane.current.setFromNormalAndCoplanarPoint(normal, meshRef.current?.position ?? new THREE.Vector3());

    document.body.style.cursor = 'grabbing';
  };

  const onMove = (e: any) => {
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

  const onUp = (e: any) => {
    e.stopPropagation();
    setClicked(false);
    setDragging(false);
    const pos = currentPosition.current.clone();
    const zone = forbiddenZone(e.clientX, e.clientY);
    if (zone) {
      const from = pos.clone();
      const to = pos.clone();
      if (zone === 'header') {
        const headerBottom = (document.querySelector('.app-header') as HTMLElement)?.getBoundingClientRect().bottom || 0;
        const radiusPx = radius * camera.zoom;
        const safeYScreen = headerBottom + BALL_CONFIG.SEARCH_SNAP_MARGIN + radiusPx;
        to.y = screenYToWorldY(safeYScreen);
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
          to.y = safeWorldY;
        }
      }
      if (zone === 'left') {
        const sidebar = document.querySelector('.sidebar') as HTMLElement;
        const sidebarRightPx = sidebar.getBoundingClientRect().right;
        const sidebarWorldX = screenXToWorldX(sidebarRightPx);
        const marginWorld = BALL_CONFIG.SIDEBAR_SNAP_MARGIN / camera.zoom;
        to.x = sidebarWorldX + marginWorld;
      }
      animateSnap(from, to);
    } else {
      onDragStateChange?.(false);
    }
    document.body.style.cursor = hovered ? 'grab' : 'auto';
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  /* ───────────────────────────────── JSX ────────────────────────────────── */
  return (
    <mesh
      ref={meshRef}
      position={position}
      onPointerOver={onOver}
      onPointerOut={onOut}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      {...props}
    >
      <sphereGeometry args={[radius, 64, 64]} />
      <meshStandardMaterial
        ref={materialRef}
        roughness={0.3}
        metalness={0.3}
        emissiveIntensity={0.15}
        opacity={0}
        transparent
      />
    </mesh>
  );
};

export default AnchorBall;
