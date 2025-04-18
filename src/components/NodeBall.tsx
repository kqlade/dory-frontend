import React, {
  useRef,
  useMemo,
  useEffect,
  useState,
  useCallback,
} from 'react';
import {
  MeshProps,
  ThreeEvent,
  useFrame,
  useThree,
} from '@react-three/fiber';
import { useCursor } from '@react-three/drei';
import * as THREE from 'three';
import { BALL_CONFIG } from '../config';
import NodeTooltip from './NodeTooltip';
import { PageData } from '../types/graph';
import { useTheme } from '../theme';

/**
 * NodeBall – Interactive, draggable sphere.
 * — Snap / forbidden‑zone logic removed (UI now stays faded).
 */

type Props = Omit<MeshProps, 'position'> & {
  position: [number, number, number];
  radius?: number;
  onPositionChange?: (p: THREE.Vector3) => void;
  onDragStateChange?: (dragging: boolean) => void;
  fixedY?: boolean;
  allowDrag?: boolean;
  pageData?: PageData;
  isDarkMode?: boolean;
};

/** Tooltip is visible when either hovered *or* the user clicked the ball */
type TooltipState = 'none' | 'hover' | 'pinned';

const ENTRY_DURATION = 0.4; // s

const NodeBall: React.FC<Props> = ({
  position,
  radius = BALL_CONFIG.NODE_RADIUS,
  onPositionChange,
  onDragStateChange,
  fixedY = false,
  allowDrag = true,
  pageData,
  isDarkMode: propIsDarkMode,
  ...meshProps
}) => {
  // Get theme from context
  const { colors, isDarkMode: contextIsDarkMode } = useTheme();
  // Use prop if provided, otherwise fall back to context
  const isDarkMode = propIsDarkMode !== undefined ? propIsDarkMode : contextIsDarkMode;
  // Force colors based on theme state to avoid context issues
  const effectiveColors = {
    text: isDarkMode ? '#e8eaed' : '#202124',
    // add other needed colors here
  };

  /* ─────────── Refs & local state ─────────── */
  const mesh   = useRef<THREE.Mesh>(null!);
  const mat    = useRef<THREE.MeshStandardMaterial>(null!);
  const offset = useRef(new THREE.Vector3());
  const plane  = useRef(new THREE.Plane());
  const curr   = useRef(new THREE.Vector3(...position));
  const dest   = useRef(new THREE.Vector3(...position));

  const { camera } = useThree();

  const [entryDone, setEntryDone] = useState(false);
  const [click, setClick] = useState(false);
  const [drag, setDrag] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState>('none');
  useCursor(tooltip !== 'none');

  /* ─────────── Sync external position prop ─────────── */
  useEffect(() => {
    curr.current.set(...position);
    dest.current.set(...position);
    mesh.current.position.copy(dest.current);
  }, [position]);

  /* ─────────── Frame loop ─────────── */
  useFrame(({ clock }) => {
    /* entry fade‑in */
    if (!entryDone) {
      const t = Math.min(clock.elapsedTime / ENTRY_DURATION, 1);
      mesh.current.scale.setScalar(0.8 + 0.2 * t);
      mat.current.opacity = t;
      if (t === 1) {
        mat.current.transparent = false;
        setEntryDone(true);
      }
    }

    /* smooth follow */
    mesh.current.position.lerp(dest.current, 0.25);

    /* hover / click pulse */
    const pulse =
      tooltip !== 'none'
        ? 1 + 0.012 * Math.sin(clock.elapsedTime * 1.8) * (tooltip === 'pinned' ? 1.08 : 1)
        : 1;
    mesh.current.scale.setScalar(pulse);

    // Apply theme color directly in useFrame to ensure updates
    mat.current.color.set(effectiveColors.text);
    mat.current.emissive.set(effectiveColors.text);
    mat.current.emissiveIntensity = tooltip !== 'none' ? 0.25 : 1.05;
  });

  /* ─────────── helpers ─────────── */
  const emitPos = (v: THREE.Vector3) => onPositionChange?.(v.clone());

  /* ─────────── Pointer events ─────────── */
  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (tooltip === 'none') setTooltip('hover');
  };

  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (tooltip === 'hover') setTooltip('none');
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    setTooltip((prev) => (prev === 'pinned' ? 'hover' : 'pinned'));
  };

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (!allowDrag) return;
    e.stopPropagation();
    setDrag(true);
    onDragStateChange?.(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    // Use world-space position as reference
    const worldPos = new THREE.Vector3();
    mesh.current.getWorldPosition(worldPos);
    offset.current.copy(worldPos).sub(e.point);

    const n = new THREE.Vector3();
    camera.getWorldDirection(n);
    plane.current.setFromNormalAndCoplanarPoint(n, worldPos);
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!drag) return;
    e.stopPropagation();
    const hit = new THREE.Vector3();
    if (e.ray.intersectPlane(plane.current, hit)) {
      const next = hit.add(offset.current);
      if (fixedY) next.y = curr.current.y;
      // Convert world-space next to local coordinates of parent (brain group)
      const localNext = mesh.current.parent
        ? mesh.current.parent.worldToLocal(next.clone())
        : next.clone();

      dest.current.copy(localNext);
      curr.current.copy(localNext);
      emitPos(next);
    }
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (!allowDrag) return;
    e.stopPropagation();
    setDrag(false);
    onDragStateChange?.(false);
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  /* ─────────── Render ─────────── */
  return (
    <mesh
      ref={mesh}
      position={position}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      {...meshProps}
    >
      <sphereGeometry args={[radius, 64, 64]} />
      <meshStandardMaterial
        ref={mat}
        roughness={0.3}
        metalness={0.1}
        opacity={0}
        transparent
      />
      {tooltip !== 'none' && pageData && (
        <NodeTooltip title={pageData.title} url={pageData.url} radius={radius} />
      )}
    </mesh>
  );
};

export default NodeBall;