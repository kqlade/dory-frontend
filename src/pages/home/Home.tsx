/* -------------------------------------------------------------------------- */
/*  Home.tsx – Interactive "brain" scene with draggable nodes                 */
/* -------------------------------------------------------------------------- */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { useDrag } from '../../context/DragContext';
import AnchorBall from '../../components/AnchorBall';
import NodeBall from '../../components/NodeBall';
import FloppyConnection from '../../components/FloppyConnection';
import NewTabSearchBar from '../../components/NewTabSearchBar';
import useBackgroundPreferences from '../../hooks/useBackgroundPreferences';
import { BALL_CONFIG } from '../../config';
import { useAuth } from '../../services/AuthContext';
import { fetchRecentConcept, getCachedRecentConcept } from '../../services/graphService';
import { PageData, RelationshipData } from '../../types/graph';

import './Home.css';

/* -------------------------------------------------------------------------- */
/*  Utility: Fibonacci-sphere point cloud                                     */
/* -------------------------------------------------------------------------- */

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~2.39996 rad

const makeFibonacciSphere = (count: number, radius: number): THREE.Vector3[] =>
  Array.from({ length: count }, (_, i) => {
    const offset = 2 / count;
    const y = (i * offset - 1) + offset / 2;
    const r = Math.sqrt(1 - y * y);
    const phi = i * GOLDEN_ANGLE;

    return new THREE.Vector3(
      radius * Math.cos(phi) * r,
      radius * y,
      radius * Math.sin(phi) * r,
    );
  });

/* -------------------------------------------------------------------------- */
/*  Brain scene                                                               */
/* -------------------------------------------------------------------------- */

interface BallSceneProps {
  screenY: number;
  pages?: PageData[] | null;
  relationships?: RelationshipData[] | null;
  onDragStateChange: (dragging: boolean) => void;
}

const BallScene: React.FC<BallSceneProps> = ({ screenY, pages, relationships, onDragStateChange }) => {
  /* ------------ R3F context -------------------------------------------- */
  const { viewport, invalidate } = useThree();

  /* ------------ Anchor position ---------------------------------------- */
  const [anchorPos, setAnchorPos] = useState(
    () => new THREE.Vector3(0, (0.5 - screenY / window.innerHeight) * viewport.height, 0),
  );

  // Generate initial offsets and connections once --------------------------------
  const initialOffsets = useMemo(
    () => makeFibonacciSphere(
      // Use pages length if available, otherwise fallback to demo count
      pages?.length || BALL_CONFIG.BRAIN_NODE_COUNT,
      // Scale radius down as node count increases
      2.5 * Math.pow(BALL_CONFIG.BRAIN_NODE_COUNT / (pages?.length || BALL_CONFIG.BRAIN_NODE_COUNT), 1/3)
    ),
    [pages]
  );

  const [nodeOffsets, setNodeOffsets] = useState<THREE.Vector3[]>(initialOffsets);

  // Update offsets when pages change
  useEffect(() => {
    setNodeOffsets(initialOffsets);
  }, [initialOffsets]);

  const [nodeConnections] = useState<[number, number][]>(() => {
    // If we have relationships data, use that to create connections
    if (relationships?.length && pages?.length) {
      const edges = new Set<string>();
      relationships.forEach(rel => {
        if (rel.type === 'TRANSITIONS_TO' || rel.type === 'CO_OCCURRING') {
          const sourceIdx = pages.findIndex(p => p.pageId === rel.source);
          const targetIdx = pages.findIndex(p => p.pageId === rel.target);
          if (sourceIdx !== -1 && targetIdx !== -1) {
            const key = `${Math.min(sourceIdx, targetIdx)}-${Math.max(sourceIdx, targetIdx)}`;
            edges.add(key);
          }
        }
      });
      return Array.from(edges).map(key => {
        const [a, b] = key.split('-').map(Number);
        return [a, b] as [number, number];
      });
    }

    // Otherwise use demo connections logic
    const K_NEIGHBOURS = 2;
    const EXTRA_RANDOM = Math.min(3, initialOffsets.length);
    const edges: [number, number][] = [];
    const seen = new Set<string>();

    initialOffsets.forEach((v, i) => {
      initialOffsets
        .map((w, j) => ({ j, dist: v.distanceTo(w) }))
        .filter(({ j }) => j !== i)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, K_NEIGHBOURS)
        .forEach(({ j }) => {
          const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
          if (!seen.has(key)) {
            seen.add(key);
            edges.push([i, j]);
          }
        });
    });

    while (edges.length < (initialOffsets.length * K_NEIGHBOURS) / 2 + EXTRA_RANDOM) {
      const a = Math.floor(Math.random() * initialOffsets.length);
      const b = Math.floor(Math.random() * initialOffsets.length);
      if (a === b) continue;
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push([a, b]);
      }
    }

    return edges;
  });

  /* ------------ Animation state --------------------------------------- */
  const rotationY = useRef(0);               // current rotation about Y axis
  const yAxis = new THREE.Vector3(0, 1, 0);
  const stopRotation = useRef(false);        // latch – flips true on first drag
  const [worldPositions, setWorldPositions] = useState<THREE.Vector3[]>([]);
  const { isDragging } = useDrag();
  const { isDarkMode } = useBackgroundPreferences();

  /* ------------ Drag state handler ------------------------------------ */
  const handleDragStateChange = useCallback((d: boolean) => {
    if (d) stopRotation.current = true; // permanently stop rotation
    onDragStateChange(d);               // propagate to context
  }, [onDragStateChange]);

  /* ------------ Per-frame update -------------------------------------- */
  useFrame((_, delta) => {
    if (!stopRotation.current && !isDragging) {
      rotationY.current += 0.6 * delta; // rotate until first drag
    }

    const next = nodeOffsets.map((local) =>
      local
        .clone()
        .applyAxisAngle(yAxis, rotationY.current)
        .add(anchorPos),
    );

    setWorldPositions(next);
    invalidate(); // force React refresh so children receive new props
  });

  /* ------------ Callbacks --------------------------------------------- */
  const handleAnchorMove = useCallback((v: THREE.Vector3) => {
    setAnchorPos(v.clone());
  }, []);

  const updateNode = useCallback(
    (idx: number, worldPos: THREE.Vector3) => {
      setNodeOffsets((prev) => {
        const unrotated = worldPos
          .clone()
          .sub(anchorPos)
          .applyAxisAngle(yAxis, -rotationY.current); // remove current rot

        const next = [...prev];
        next[idx] = unrotated;
        return next;
      });
    },
    [anchorPos],
  );

  /* ------------ Radii -------------------------------------------------- */
  const anchorR = BALL_CONFIG.ANCHOR_RADIUS;
  const nodeR = BALL_CONFIG.NODE_RADIUS;

  /* ------------ Render ------------------------------------------------- */
  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight position={[3, 4, 5]} intensity={1} />

      {/* Anchor ball */}
      <AnchorBall
        position={anchorPos.toArray() as [number, number, number]}
        radius={anchorR}
        allowDrag
        onPositionChange={handleAnchorMove}
        onDragStateChange={handleDragStateChange}
      />

      {/* Nodes + spokes */}
      {worldPositions.map((worldPos, i) => (
        <React.Fragment key={i}>
          <NodeBall
            position={worldPos.toArray() as [number, number, number]}
            radius={nodeR}
            allowDrag
            onPositionChange={(v) => updateNode(i, v)}
            onDragStateChange={handleDragStateChange}
            isDarkMode={isDarkMode}
          />
          <FloppyConnection
            startCenter={anchorPos}
            endCenter={worldPos}
            startRadius={anchorR}
            endRadius={nodeR}
            opacity={1}
            maxSag={0.8}
            tautDistance={10}
            minDistance={2}
          />
        </React.Fragment>
      ))}

      {/* Node-to-node connections */}
      {worldPositions.length > 0 &&
        nodeConnections.map(([a, b], idx) => (
          <FloppyConnection
            key={`nn-${idx}`}
            startCenter={worldPositions[a]}
            endCenter={worldPositions[b]}
            startRadius={nodeR}
            endRadius={nodeR}
            opacity={0.6}
            maxSag={0.4}
            tautDistance={5}
            minDistance={1}
          />
        ))}
    </>
  );
};

/* -------------------------------------------------------------------------- */
/*  Page component                                                            */
/* -------------------------------------------------------------------------- */

const Home: React.FC = () => {
  const searchBarRef = useRef<HTMLDivElement>(null);
  const [midpointY, setMidpointY] = useState<number | null>(null);

  const { isDragging, setDragging } = useDrag();
  const { isDarkMode } = useBackgroundPreferences(); // currently only read for children
  const { user } = useAuth();

  // concept graph state
  const [pages, setPages] = useState<PageData[] | null>(null);
  const [rels, setRels] = useState<RelationshipData[] | null>(null);

  // Fetch recent concept once authenticated
  useEffect(() => {
    if (!user?.id) return;
    const cached = getCachedRecentConcept(user.id);
    if (cached) {
      setPages(cached.concept.pages);
      setRels(cached.relationships);
    }
    fetchRecentConcept(user.id)
      .then((res) => {
        setPages(res.concept.pages);
        setRels(res.relationships);
      })
      .catch((err) => console.warn('[Home] recent concept fetch failed', err));
  }, [user]);

  /** becomes true on the first drag and never goes back */
  const [hasDragged, setHasDragged] = useState(false);

  /* ---- Fade UI while dragging ----------------------------------------- */
  useEffect(() => {
    document.body.classList.toggle('dragging', hasDragged);
    if (hasDragged) {
      const sb = document.querySelector('.sidebar');
      sb?.classList.add('collapsed'); // mimic manual collapse
    }
  }, [hasDragged]);

  /* ---- Compute vertical midpoint -------------------------------------- */
  useEffect(() => {
    const calculateMidpoint = () =>
      requestAnimationFrame(() => {
        const headerBottom =
          document.querySelector('.app-header')?.getBoundingClientRect().bottom ?? 50;
        const searchTop =
          searchBarRef.current?.getBoundingClientRect().top ??
          window.innerHeight * 0.4;

        setMidpointY(headerBottom + (searchTop - headerBottom) / 2);
      });

    calculateMidpoint();
    window.addEventListener('resize', calculateMidpoint);
    return () => window.removeEventListener('resize', calculateMidpoint);
  }, []);

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
            <BallScene
              screenY={midpointY}
              pages={pages}
              relationships={rels}
              onDragStateChange={(d) => {
                setDragging(d);
                if (d) setHasDragged(true);
              }}
            />
          )}
        </Canvas>
      </div>

      {/* Search bar */}
      <div className="search-bar-flex-container">
        <div className="home-search-wrapper" ref={searchBarRef}>
          <NewTabSearchBar />
        </div>
      </div>

      {/* Future page content */}
      <main className="page-content" />
    </div>
  );
};

export default Home;