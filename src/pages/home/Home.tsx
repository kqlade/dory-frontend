import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useDrag } from '../../context/DragContext';

import AnchorBall from '../../components/AnchorBall';
import NodeBall from '../../components/NodeBall';
import FloppyConnection from '../../components/FloppyConnection';
import NewTabSearchBar from '../../components/NewTabSearchBar';
import useBackgroundPreferences from '../../hooks/useBackgroundPreferences';
import { BALL_CONFIG } from '../../config';

import './Home.css';

/* -------------------------------------------------------------------------- */
/*                                 Constants                                  */
/* -------------------------------------------------------------------------- */
const ANIMATION_DURATION = 0.4; // s – must match ball entry animation
const HORIZONTAL_SEPARATION = 3; // distance between the two balls

/* -------------------------------------------------------------------------- */
/*                               BallScene                                    */
/* -------------------------------------------------------------------------- */
interface BallSceneProps {
  screenY: number; // vertical position (in px) around which to centre the pair
  onDragStateChange: (dragging: boolean) => void;
}

const BallScene: React.FC<BallSceneProps> = ({ screenY, onDragStateChange }) => {
  /* ------------------------------- R3F hooks ------------------------------ */
  const { viewport } = useThree();

  /* --------------------------- Derived world Y ---------------------------- */
  const worldY = (0.5 - screenY / window.innerHeight) * viewport.height;

  /* -------------------------- Positions & state -------------------------- */
  const [anchorPos, setAnchorPos] = useState(() => new THREE.Vector3(0, worldY, 0)); // centre

  // Generate a hemispherical cloud of ~30 nodes around the anchor (runs once per mount)
  const [nodePositions, setNodePositions] = useState<THREE.Vector3[]>(() => {
    const pts: THREE.Vector3[] = [];
    const N = BALL_CONFIG.BRAIN_NODE_COUNT;
    const radius = 3; // sphere radius
    const offset = 2 / N;
    const increment = Math.PI * (3 - Math.sqrt(5)); // golden angle
    for (let i = 0; i < N; i++) {
      const y = ((i * offset) - 1) + (offset / 2);
      const r = Math.sqrt(1 - y * y);
      const phi = i * increment;
      pts.push(
        new THREE.Vector3(
          radius * Math.cos(phi) * r,
          radius * y,
          radius * Math.sin(phi) * r,
        ).add(new THREE.Vector3(0, worldY, 0)),
      );
    }
    return pts;
  });

  /* ----------------------- Update when screenY/viewport change ------------ */
  useEffect(() => {
    setAnchorPos(new THREE.Vector3(0, worldY, 0));
    // Shift all nodes by the delta Y to preserve relative layout on resize
    setNodePositions(prev => prev.map(p => p.clone().setY(p.y - anchorPos.y + worldY)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldY]);

  /* ----------------------------- Opacity anim ----------------------------- */
  const [opacity, setOpacity] = useState(0);
  const startTimeRef = useRef(performance.now());

  useFrame(() => {
    if (opacity === 1) return; // stop updating once fully opaque
    const t = Math.min((performance.now() - startTimeRef.current) / 1000 / ANIMATION_DURATION, 1);
    setOpacity(t);
  });

  /* --------------------------- Position handlers -------------------------- */
  const handleAnchorMove = useCallback((v: THREE.Vector3) => {
    setAnchorPos(v);
    // Update node positions relative to the new anchor position
    setNodePositions(prev => prev.map(p => {
      const relativePos = p.clone().sub(anchorPos);
      return relativePos.add(v);
    }));
  }, [anchorPos]);

  const updateNode = useCallback((idx: number, v: THREE.Vector3) => {
    setNodePositions(prev => {
      const next = [...prev];
      next[idx] = v;
      return next;
    });
  }, []);

  /* ------------------------------ Radii ----------------------------------- */
  const anchorRadius = BALL_CONFIG.ANCHOR_RADIUS;
  const nodeRadius = BALL_CONFIG.NODE_RADIUS;

  /* ------------------------------ Render ---------------------------------- */
  return (
    <>
      {/* Lights */}
      <ambientLight intensity={1.2} />
      <directionalLight position={[3, 4, 5]} intensity={1} />
      <directionalLight position={[-2, -1, 3]} intensity={0.3} />

      {/* Anchor Ball */}
      <AnchorBall
        position={anchorPos.toArray() as [number, number, number]}
        radius={anchorRadius}
        allowDrag
        onPositionChange={handleAnchorMove}
        onDragStateChange={onDragStateChange}
      />

      {/* Nodes + their strings */}
      {nodePositions.map((p, i) => (
        <React.Fragment key={i}>
          <NodeBall
            position={p.toArray() as [number, number, number]}
            radius={nodeRadius}
            allowDrag
            onPositionChange={v => updateNode(i, v)}
            onDragStateChange={onDragStateChange}
          />
          <FloppyConnection
            startCenter={anchorPos}
            endCenter={p}
            startRadius={anchorRadius}
            endRadius={nodeRadius}
            opacity={opacity}
            maxSag={0.8}
            tautDistance={10}
            minDistance={2}
          />
        </React.Fragment>
      ))}
    </>
  );
};

/* -------------------------------------------------------------------------- */
/*                                   Home                                    */
/* -------------------------------------------------------------------------- */
const Home: React.FC = () => {
  const searchBarRef = useRef<HTMLDivElement>(null);
  const [midpointY, setMidpointY] = useState<number | null>(null);
  const { isDarkMode } = useBackgroundPreferences(); // dark‑mode hook kept if needed later

  // drag context
  const { isDragging, setDragging } = useDrag();

  // toggle body class
  useEffect(() => {
    document.body.classList.toggle('dragging', isDragging);
  }, [isDragging]);

  /* ------------------------ Compute midpoint lazily ----------------------- */
  useEffect(() => {
    const calculateMidY = () => {
      // Allow layout to settle
      requestAnimationFrame(() => {
        const header = document.querySelector('.app-header');
        const searchBarEl = searchBarRef.current;
        const topBound = header ? header.getBoundingClientRect().bottom : 50;
        const searchTop = searchBarEl ? searchBarEl.getBoundingClientRect().top : window.innerHeight * 0.4;
        setMidpointY(topBound + (searchTop - topBound) / 2);
      });
    };

    calculateMidY();
    window.addEventListener('resize', calculateMidY);
    return () => window.removeEventListener('resize', calculateMidY);
  }, []);

  /* ------------------------------ Render ---------------------------------- */
  return (
    <div className="page">
      {/* Canvas backdrop */}
      <div className="canvas-container">
        <Canvas
          orthographic
          camera={{ position: [0, 0, 5], zoom: 50 }}
          gl={{ alpha: true, antialias: true }}
          style={{ width: '100%', height: '100%' }}
        >
          {midpointY !== null && (
            <BallScene screenY={midpointY} onDragStateChange={setDragging} />
          )}
        </Canvas>
      </div>

      {/* Search bar */}
      <div className="search-bar-flex-container">
        <div className="home-search-wrapper" ref={searchBarRef}>
          <NewTabSearchBar />
        </div>
      </div>

      {/* Page content */}
      <main className="page-content">{/* … */}</main>
    </div>
  );
};

export default Home;
