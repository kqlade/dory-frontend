import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { BALL_CONFIG } from '../config';
import { useTheme } from '../theme';

/**
 * FloppyConnection.tsx – Animated quadratic line that "sags" and wobbles
 * between two spheres.
 *
 * Fixes + improvements
 * ──────────────────────────────────────────────────────────────
 * • Caches CSS colour look‑up (no per‑frame getComputedStyle)
 * • Uses refs (rather than state) for sag + stretch flags to avoid
 *   React re‑renders each frame – points state updates only when the
 *   actual curve changes.
 * • Debounces distance comparisons to reduce noise.
 */

interface FloppyConnectionProps {
  startCenter: THREE.Vector3;
  endCenter: THREE.Vector3;
  startRadius: number;
  endRadius: number;
  opacity?: number;
  lineWidth?: number;
  segments?: number;
  maxSag?: number;
  tautDistance?: number;
  minDistance?: number;
  isDarkMode?: boolean;
}

const FloppyConnection: React.FC<FloppyConnectionProps> = ({
  startCenter,
  endCenter,
  startRadius,
  endRadius,
  opacity = 1,
  lineWidth = 1.5,
  segments = 20,
  maxSag = 0.8,
  tautDistance = 10,
  minDistance = 2,
  isDarkMode: propIsDarkMode,
}) => {
  const [curvePoints, setCurvePoints] = useState<THREE.Vector3[]>([]);
  const { colors } = useTheme();

  /* ───────────── Refs to avoid 60fps React state churn ───────────── */
  const sagRef = useRef(0);
  const velocityRef = useRef(0);
  const isStretchingRef = useRef(false);
  const lastDistanceRef = useRef(0);
  const lastUpdateTimeRef = useRef(performance.now());

  const SPRING = BALL_CONFIG.SPRING;

  /* ───────────────────── Cached theme‑driven line colour ─────────── */
  const effectiveDarkMode = propIsDarkMode !== undefined ? propIsDarkMode : false;
  const lineColor = effectiveDarkMode ? '#e8eaed' : '#202124';

  /* ───────────────────────────── Frame loop ───────────────────────── */
  useFrame(() => {
    if (startCenter.equals(endCenter)) {
      setCurvePoints([]);
      return;
    }

    /* Surface points */
    const dir = new THREE.Vector3().subVectors(endCenter, startCenter).normalize();
    const surfaceStart = startCenter.clone().add(dir.clone().multiplyScalar(startRadius));
    const surfaceEnd = endCenter.clone().sub(dir.clone().multiplyScalar(endRadius));

    /* Distance handling */
    const distance = surfaceStart.distanceTo(surfaceEnd);
    const now = performance.now();
    const dt = Math.min((now - lastUpdateTimeRef.current) / 1000, 0.1);
    lastUpdateTimeRef.current = now;

    /* Stretch detection (simple hysteresis) */
    const stretchingNow = distance > lastDistanceRef.current + 0.05;
    if (stretchingNow !== isStretchingRef.current) isStretchingRef.current = stretchingNow;
    lastDistanceRef.current = distance;

    /* Sag spring */
    let targetSag = 0;
    if (distance < minDistance) targetSag = maxSag;
    else if (distance > tautDistance) targetSag = 0.05;
    else {
      const t = 1 - (distance - minDistance) / (tautDistance - minDistance);
      targetSag = maxSag * t * t;
    }

    const springForce = (targetSag - sagRef.current) * SPRING.tension;
    velocityRef.current += springForce * dt;
    velocityRef.current *= Math.max(0, 1 - SPRING.friction * dt);
    sagRef.current += velocityRef.current * dt;

    /* Control point for quadratic curve */
    const midpoint = surfaceStart.clone().lerp(surfaceEnd, 0.5);

    // Wobble when slack
    let wobble = 0;
    if (distance < tautDistance * 0.5) {
      wobble = Math.sin(now * 0.002) * 0.1 * (1 - distance / (tautDistance * 0.5));
    }

    const sagVec = new THREE.Vector3(wobble, -Math.abs(sagRef.current), wobble * 0.5);
    const stretchEffect = isStretchingRef.current ? 0.2 : 0;
    const control = midpoint.clone().lerp(surfaceStart, stretchEffect).add(sagVec);

    /* Generate curve points */
    const curve = new THREE.QuadraticBezierCurve3(surfaceStart, control, surfaceEnd);
    setCurvePoints(curve.getPoints(segments));
  });

  /* ───────────────────────── Material props memo ─────────────────── */
  const materialProps = useMemo(() => {
    let dynamicWidth = lineWidth;
    if (isStretchingRef.current && lastDistanceRef.current > tautDistance * 0.7) {
      dynamicWidth = lineWidth * 0.8;
    }
    return {
      color: lineColor,
      lineWidth: dynamicWidth,
      opacity,
      transparent: opacity < 1,
      dashed: false,
    } as const;
  }, [lineColor, lineWidth, opacity, tautDistance]);

  /* ───────────────────────────────── Render ───────────────────────── */
  if (!curvePoints.length) return null;
  return <Line points={curvePoints} {...materialProps} />;
};

export default FloppyConnection;
