/* -------------------------------------------------------------------------- *
 *  Home.tsx – Interactive "brain" scene with draggable nodes                 *
 * -------------------------------------------------------------------------- */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, useContextBridge } from '@react-three/drei';
import * as THREE from 'three';

import { useDrag } from '../../context/DragContext';
import AnchorBall from '../../components/AnchorBall';
import NodeBall from '../../components/NodeBall';
import FloppyConnection from '../../components/FloppyConnection';
import NewTabSearchBar from '../../components/NewTabSearchBar';
import { BALL_CONFIG } from '../../config';
import { useAuth } from '../../services/AuthContext';
import {
  fetchRecentConcept,
  getCachedRecentConcept,
} from '../../services/graphService';
import { PageData, RelationshipData, ConceptData } from '../../types/graph';
import { ThemeProvider } from '../../theme';
import { ThemeContext } from '../../theme/ThemeProvider';
import useBackgroundPreferences from '../../hooks/useBackgroundPreferences';
import LoadingSpinner from '../../components/LoadingSpinner';

/* -------------------------------------------------------------------------- */
/*  Fibonacci‑sphere helper                                                   */
/* -------------------------------------------------------------------------- */

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ≈ 2.39996 rad
const makeFibonacciSphere = (n: number, r: number): THREE.Vector3[] =>
  Array.from({ length: n }, (_, i) => {
    const y = (i * 2) / n - 1 + 1 / n;
    const ρ = Math.sqrt(1 - y * y);
    const φ = i * GOLDEN_ANGLE;
    return new THREE.Vector3(r * Math.cos(φ) * ρ, r * y, r * Math.sin(φ) * ρ);
  });

/* -------------------------------------------------------------------------- */
/*  BallScene                                                                 */
/* -------------------------------------------------------------------------- */

interface BallSceneProps {
  screenY: number;
  conceptData?: ConceptData | null;
  pages?: PageData[] | null;
  relationships?: RelationshipData[] | null;
  onDragStateChange: (d: boolean) => void;
  isDarkMode: boolean;
}

const BallScene: React.FC<BallSceneProps> = ({
  screenY,
  conceptData,
  pages,
  relationships,
  onDragStateChange,
  isDarkMode,
}) => {
  const { viewport, invalidate } = useThree();
  const { isDragging } = useDrag();
  const anchorRef = useRef<THREE.Mesh>(null!);
  const brainRef = useRef<THREE.Group>(null!);

  /* ---------- anchor position (layout‑driven & draggable, as ref) -------------- */
  const initialAnchorPos = useMemo(
    () =>
      new THREE.Vector3(
        0,
        (0.5 - screenY / window.innerHeight) * viewport.height,
        0,
      ),
    [screenY, viewport.height],
  );
  const anchorPos = useRef<THREE.Vector3>(initialAnchorPos.clone());
  // Keep anchorPos in sync with layout changes when not dragging
  useEffect(() => {
    anchorPos.current.copy(initialAnchorPos);
  }, [initialAnchorPos]);

  /* ---------- node offsets (object space) ------------------------------ */
  const nodeCount = pages?.length ?? BALL_CONFIG.BRAIN_NODE_COUNT;
  const nodeOffsets = useMemo(() => {
    const r =
      BALL_CONFIG.BRAIN_BASE_RADIUS *
      Math.pow(BALL_CONFIG.BRAIN_NODE_COUNT / nodeCount, 1 / 3); // shrink w/ N
    return makeFibonacciSphere(nodeCount, r);
  }, [nodeCount]);

  /* ---------- edges ---------------------------------------------------- */
  const edges = useMemo<[number, number][]>(() => {
    if (pages && relationships && relationships.length) {
      const set = new Set<string>();
      relationships.forEach((rel) => {
        if (rel.type === 'TRANSITIONS_TO' || rel.type === 'CO_OCCURRING') {
          const a = pages.findIndex((p) => p.pageId === rel.source);
          const b = pages.findIndex((p) => p.pageId === rel.target);
          if (a !== -1 && b !== -1) set.add(`${Math.min(a, b)}-${Math.max(a, b)}`);
        }
      });
      return [...set].map((s) => s.split('-').map(Number)) as [number, number][];
    }

    /* fallback lattice for demo */
    const K = 2;
    const e: [number, number][] = [];
    const seen = new Set<string>();
    nodeOffsets.forEach((v, i) => {
      nodeOffsets
        .map((w, j) => ({ j, d: v.distanceTo(w) }))
        .filter(({ j }) => j !== i)
        .sort((a, b) => a.d - b.d)
        .slice(0, K)
        .forEach(({ j }) => {
          const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
          if (!seen.has(key)) {
            seen.add(key);
            e.push([i, j]);
          }
        });
    });
    return e;
  }, [nodeOffsets, pages, relationships]);

  /* ---------- rotation & per‑frame update ------------------------------ */
  const rotY = useRef(0);
  const stopRot = useRef(false);
  const yAxis = useRef(new THREE.Vector3(0, 1, 0)).current;

  useFrame((_, dt) => {
    if (!stopRot.current && !isDragging) rotY.current += 0.6 * dt;
    // update brain group transform
    if (brainRef.current) {
      brainRef.current.rotation.set(0, rotY.current, 0);
      brainRef.current.position.copy(anchorPos.current);
    }
    invalidate();
  });

  /* ---------- dragging feedback ---------------------------------------- */
  const handleDragStateChange = useCallback(
    (d: boolean) => {
      if (d) stopRot.current = true;
      onDragStateChange(d);
    },
    [onDragStateChange],
  );

  /* ---------- node drag → update offset -------------------------------- */
  const updateNode = useCallback(
    (idx: number, worldPos: THREE.Vector3) => {
      // Mutate existing vector so props references remain valid
      nodeOffsets[idx].copy(
        worldPos
          .clone()
          .sub(anchorPos.current)
          .applyAxisAngle(yAxis, -rotY.current)
      );
    },
    [nodeOffsets, yAxis],
  );

  /* ---------- radii ---------------------------------------------------- */
  const anchorR = BALL_CONFIG.ANCHOR_RADIUS;
  const nodeR = BALL_CONFIG.NODE_RADIUS;

  /* ---------- render --------------------------------------------------- */
  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight position={[3, 4, 5]} intensity={1} />

      {/* anchor */}
      <AnchorBall
        ref={anchorRef}
        position={anchorPos.current.toArray() as [number, number, number]}
        radius={anchorR}
        allowDrag
        onDragStateChange={handleDragStateChange}
        onPositionChange={(v) => anchorPos.current.copy(v)}
        isDarkMode={isDarkMode}
        conceptData={conceptData || undefined}
      />

      {/* brain group containing nodes and connections */}
      <group ref={brainRef}>
        {pages && pages.length > 0 && nodeOffsets.map((offset, i) => {
          const pageData = pages[i];
          return (
            <React.Fragment key={i}>
              <NodeBall
                position={offset.toArray() as [number, number, number]}
                radius={nodeR}
                allowDrag
                pageData={pageData}
                onPositionChange={(v) => updateNode(i, v)}
                onDragStateChange={handleDragStateChange}
                isDarkMode={isDarkMode}
              />
              {/* anchor -> node connection */}
              <FloppyConnection
                startCenter={new THREE.Vector3(0, 0, 0)}
                endCenter={offset}
                startRadius={anchorR}
                endRadius={nodeR}
                opacity={1}
                maxSag={0.8}
                tautDistance={10}
                minDistance={2}
                isDarkMode={isDarkMode}
              />
            </React.Fragment>
          );
        })}

        {/* edges between nodes */}
        {pages && pages.length > 0 && edges.map(([a, b], i) => (
          <FloppyConnection
            key={`e-${i}`}
            startCenter={nodeOffsets[a]}
            endCenter={nodeOffsets[b]}
            startRadius={nodeR}
            endRadius={nodeR}
            opacity={0.6}
            maxSag={0.4}
            tautDistance={5}
            minDistance={1}
            isDarkMode={isDarkMode}
          />
        ))}
      </group>
    </>
  );
};

/* -------------------------------------------------------------------------- */
/*  Home – page wrapper                                                       */
/* -------------------------------------------------------------------------- */

const Home: React.FC = () => {
  const searchBarRef = useRef<HTMLDivElement>(null);
  const [midY, setMidY] = useState<number | null>(null);

  const { setDragging } = useDrag();
  const { user } = useAuth();
  const { isDarkMode } = useBackgroundPreferences();

  // Reintroduce hasDragged state
  const [hasDragged, setHasDragged] = useState(false);

  const [conceptData, setConceptData] = useState<ConceptData | null>(null);
  const [pages, setPages] = useState<PageData[] | null>(null);
  const [rels, setRels] = useState<RelationshipData[] | null>(null);

  /* fetch concept graph (cache → network) */
  useEffect(() => {
    if (!user?.id) return;

    const cached = getCachedRecentConcept(user.id);
    if (cached) {
      setConceptData(cached.concept);
      setPages(cached.concept.pages);
      setRels(cached.relationships);
    }

    fetchRecentConcept(user.id)
      .then((res) => {
        setConceptData(res.concept);
        setPages(res.concept.pages);
        setRels(res.relationships);
      })
      .catch((err) => console.warn('[Home] recent concept fetch failed', err));
  }, [user]);

  /* listen for cold storage sync completion to refresh recent concept */
  useEffect(() => {
    if (!user?.id) return;

    const handler = (msg: any) => {
      if (msg?.type === 'COLD_STORAGE_SYNC_COMPLETE') {
        console.log('[Home] Cold storage sync complete message received, refreshing recent concept');
        fetchRecentConcept(user.id)
          .then((res) => {
            setConceptData(res.concept);
            setPages(res.concept.pages);
            setRels(res.relationships);
          })
          .catch((err) => console.warn('[Home] recent concept fetch failed after sync', err));
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => {
      chrome.runtime.onMessage.removeListener(handler);
    };
  }, [user]);

  // Reintroduce useEffect for hasDragged focus effect
  useEffect(() => {
    document.body.classList.toggle('dragging', hasDragged);
    if (hasDragged) {
      // collapse sidebar exactly like the old behaviour
      document.querySelector('.sidebar')?.classList.add('collapsed');
    }
  }, [hasDragged]);

  /* recompute canvas midpoint */
  useEffect(() => {
    const compute = () =>
      requestAnimationFrame(() => {
        const top =
          document.querySelector('.app-header')?.getBoundingClientRect().bottom ??
          50;
        const sbTop =
          searchBarRef.current?.getBoundingClientRect().top ??
          window.innerHeight * 0.4;
        setMidY(top + (sbTop - top) / 2);
      });

    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  return (
    <ThemeProvider>
      <div className="page">
        <div className="canvas-container">
          {pages && pages.length > 0 ? (
            <GraphCanvas 
              midY={midY} 
              conceptData={conceptData}
              pages={pages} 
              rels={rels} 
              setDragging={setDragging} 
              setHasDragged={setHasDragged} 
              isDarkMode={isDarkMode} 
            />
          ) : (
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%'}}>
              <LoadingSpinner showText={false} fullScreen={false} />
              <p style={{marginTop:12,fontFamily:'Cabinet Grotesk, sans-serif',fontSize:14,color:'var(--text-secondary)'}}>Learning more about your work…</p>
            </div>
          )}
        </div>

        <div className="search-bar-flex-container">
          <div className="home-search-wrapper" ref={searchBarRef}>
            <NewTabSearchBar />
            <ShortcutHint />
          </div>
        </div>

        <main className="page-content" />
      </div>
    </ThemeProvider>
  );
};

/* shortcut helper */
const ShortcutHint: React.FC = () => {
  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  return (
    <div className="shortcut-helper-text" style={{ fontSize: 12 }}>
      Press {isMac ? '⌘' : 'Ctrl'} + Shift + P to use DORY on any tab
    </div>
  );
};

const GraphCanvas: React.FC<{
  midY:number|null,
  conceptData:ConceptData|null,
  pages:PageData[]|null,
  rels:RelationshipData[]|null,
  setDragging:(d:boolean)=>void,
  setHasDragged:(v:boolean)=>void,
  isDarkMode: boolean
}> = ({
  midY,
  conceptData,
  pages,
  rels,
  setDragging,
  setHasDragged,
  isDarkMode
}) => {
  // Force ball/connector colors via direct props instead of context
  const forcedTheme = { isDarkMode };

  const anchorCallback = (d:boolean)=>{
    setDragging(d);
    if(d) setHasDragged(true);
  };
  return (
    <Canvas orthographic camera={{ position:[0,0,5], zoom:50 }} gl={{ alpha:true, antialias:true }}>
      {midY !== null && (
        <BallScene 
          screenY={midY} 
          conceptData={conceptData}
          pages={pages} 
          relationships={rels} 
          onDragStateChange={anchorCallback}
          isDarkMode={isDarkMode} 
        />
      )}
    </Canvas>
  );
};

export default Home;