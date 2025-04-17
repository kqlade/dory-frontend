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
import * as THREE from 'three';
import { BALL_CONFIG } from '../config';

/**
 * AnchorBall – main (cyan) sphere.
 * Snap / forbidden‑zone logic removed (UI elements fade permanently).
 */

type Props = Omit<MeshProps, 'position'> & {
  position: [number, number, number];
  radius?: number;
  onPositionChange?: (p: THREE.Vector3) => void;
  onDragStateChange?: (dragging: boolean) => void;
  fixedY?: boolean;
  allowDrag?: boolean;
};

const ENTRY_DUR = 0.4; // s

const AnchorBall: React.FC<Props> = ({
  position,
  radius = BALL_CONFIG.ANCHOR_RADIUS,
  onPositionChange,
  onDragStateChange,
  fixedY = false,
  allowDrag = true,
  ...rest
}) => {
  /* ─────────── Refs & state ─────────── */
  const mesh   = useRef<THREE.Mesh>(null!);
  const mat    = useRef<THREE.MeshStandardMaterial>(null!);
  const offset = useRef(new THREE.Vector3());
  const plane  = useRef(new THREE.Plane());
  const curr   = useRef(new THREE.Vector3(...position));
  const dest   = useRef(new THREE.Vector3(...position));

  const { camera } = useThree();

  const [entryDone, setEntryDone] = useState(false);
  const [hover,     setHover]     = useState(false);
  const [click,     setClick]     = useState(false);
  const [drag,      setDrag]      = useState(false);

  /* ─────────── Theme colours ─────────── */
  const theme = useMemo(
    () => ({ base: '#00c8e6', emissive: '#00c8e6' }),
    []
  );

  /* ─────────── Sync external position ─────────── */
  useEffect(() => {
    curr.current.set(...position);
    dest.current.set(...position);
    mesh.current.position.copy(dest.current);
  }, [position]);

  const emitPos = (v: THREE.Vector3) => onPositionChange?.(v.clone());
  const setCursor = (c: 'default' | 'grab' | 'grabbing') =>
    (document.body.style.cursor = c);

  /* ─────────── Frame loop ─────────── */
  useFrame(({ clock }) => {
    /* entry fade‑in */
    if (!entryDone) {
      const t = Math.min(clock.elapsedTime / ENTRY_DUR, 1);
      mesh.current.scale.setScalar(0.8 + 0.2 * t);
      mat.current.opacity = t;
      if (t === 1) {
        mat.current.transparent = false;
        setEntryDone(true);
      }
    }

    mesh.current.position.lerp(dest.current, 0.25);

    /* pulse */
    const active = hover || click;
    const pulse =
      active ? 1 + 0.03 * Math.sin(clock.elapsedTime * 1.8) * (click ? 1.2 : 1) : 1;
    mesh.current.scale.setScalar(pulse);

    mat.current.color.set(theme.base);
    mat.current.emissive.set(theme.emissive);
    mat.current.emissiveIntensity = active ? 0.25 : 1.05;
  });

  /* ─────────── Pointer events ─────────── */
  const over = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHover(true);
    if (!drag) setCursor('grab');
  }, [drag]);

  const out = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHover(false);
    if (!drag) setCursor('default');
  }, [drag]);

  const down = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setClick(true);
    if (!allowDrag) return;
    setDrag(true);
    onDragStateChange?.(true);

    offset.current.copy(mesh.current.position).sub(e.point);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    const n = new THREE.Vector3();
    camera.getWorldDirection(n);
    plane.current.setFromNormalAndCoplanarPoint(n, mesh.current.position);

    setCursor('grabbing');
  }, [allowDrag, camera, onDragStateChange]);

  const move = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!drag) return;
    e.stopPropagation();
    const hit = new THREE.Vector3();
    if (e.ray.intersectPlane(plane.current, hit)) {
      const next = hit.add(offset.current);
      if (fixedY) next.y = curr.current.y;
      dest.current.copy(next);
      curr.current.copy(next);
      emitPos(next);
    }
  }, [drag, fixedY]);

  const up = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setClick(false);
    setDrag(false);
    onDragStateChange?.(false);

    setCursor(hover ? 'grab' : 'default');
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, [hover, onDragStateChange]);

  /* ─────────── Render ─────────── */
  return (
    <mesh
      ref={mesh}
      position={position}
      onPointerOver={over}
      onPointerOut={out}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      {...rest}
    >
      <sphereGeometry args={[radius, 64, 64]} />
      <meshStandardMaterial
        ref={mat}
        roughness={0.3}
        metalness={0.3}
        opacity={0}
        transparent
      />
    </mesh>
  );
};

export default React.memo(AnchorBall);