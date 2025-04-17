Below is an outline of how to achieve exactly what you’ve asked for:
	1.	Orthographic Camera so there’s no perspective distortion.
	2.	A simple radial layout (concept in the center, pages in a circle).
	3.	Camera is essentially fixed, but we allow a simple “2D rotate” of the entire layout around the Z-axis for a bit of interactivity. (No zoom, no pan, no 3D tilt.)
	4.	Drag restricted to a single plane so nodes don’t jump in Z and remain the same on-screen size.
	5.	When the center concept node moves, it drags the entire network.
	6.	Nodes and connection lines remain visible; lines get updated lengths as you drag.
	7.	Stable arrangement each time (no random distribution).
	8.	Node sizes come from a simple config (like CONCEPT_NODE_SIZE and PAGE_NODE_SIZE).

Below is a working example of how you could implement it. Read through the code carefully, as it is somewhat different from your existing approach.

⸻

Step 1: Create a stable radial layout

Let’s define a function that places the concept node at the center (0,0,0) and then places pages evenly on a circle around it in the XY plane (Z=0).  For N pages, each will be at an angle theta = (2π / N) * i from the center, at a fixed radius R.

// radialLayout.ts
import * as THREE from 'three';
import { GraphData, RelationshipData, RelationshipType } from '../types/graph';

export interface Node3D {
  id: string;
  position: THREE.Vector3;
  radius: number;
  color: string;
  type: 'concept' | 'page';
  data: any;
}

export interface Connection3D {
  id: string;
  source: string;
  target: string;
  type: string;
  color: string;
  thickness: number;
  animated: boolean;
}

export interface Layout3D {
  nodes: Node3D[];
  connections: Connection3D[];
}

const CONCEPT_NODE_SIZE = 3;
const PAGE_NODE_SIZE = 1.5;
const PAGE_RING_RADIUS = 20;  // Distance from center
const LINE_THICKNESS = 0.05;

// Example color logic
function getNodeColor(type: 'concept' | 'page'): string {
  return type === 'concept' ? '#3498db' : '#ff6b6b';
}

function getConnectionColor(type: string): string {
  // For now, everything is the same color
  return '#999999';
}

export function generateRadialLayout(graphData: GraphData): Layout3D {
  const { concept, relationships } = graphData;
  const pages = concept.pages;

  const nodes: Node3D[] = [];
  const connections: Connection3D[] = [];

  // 1) Concept node at center
  nodes.push({
    id: concept.conceptId,
    position: new THREE.Vector3(0, 0, 0),
    radius: CONCEPT_NODE_SIZE,
    color: getNodeColor('concept'),
    type: 'concept',
    data: concept
  });

  // 2) Distribute pages in a circle
  pages.forEach((page, i) => {
    const angle = (2 * Math.PI * i) / pages.length;
    const x = PAGE_RING_RADIUS * Math.cos(angle);
    const y = PAGE_RING_RADIUS * Math.sin(angle);

    nodes.push({
      id: page.pageId,
      position: new THREE.Vector3(x, y, 0),
      radius: PAGE_NODE_SIZE,
      color: getNodeColor('page'),
      type: 'page',
      data: page
    });
  });

  // 3) Build connections. For simplicity, connect each page to the concept if that’s your model
  //    Or loop through your relationships array if you have more complex edges.
  relationships.forEach((rel, idx) => {
    connections.push({
      id: `connection-${idx}`,
      source: rel.source,
      target: rel.target,
      type: rel.type,
      color: getConnectionColor(rel.type),
      thickness: LINE_THICKNESS,
      animated: false
    });
  });

  return { nodes, connections };
}

This ensures the layout is always the same circle, so it’s stable each time.

⸻

Step 2: Use an Orthographic Camera + limited rotation

In React-Three-Fiber, to get an orthographic camera that only rotates around the Z-axis (like a flat disk turning in front of you), we can use <OrbitControls> with some constraints:
	•	orthographic prop on <Canvas>.
	•	A default camera position, say at [0, 0, 50], looking at [0, 0, 0].
	•	We disable pan (enablePan={false}) and zoom (enableZoom={false}).
	•	We tweak polar angles so it doesn’t tilt away from the plane, meaning minPolarAngle = maxPolarAngle = Math.PI / 2.
	•	That ensures you can only spin around the Z-axis. (You can also clamp the azimuth angle if you want, or let it go full 360°.)

⸻

Step 3: Single-plane dragging

We’ll restrict node dragging to the XY plane. Since the camera is orthographic, looking down Z, we can:
	•	On pointer down, define a plane: plane.current = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0). This is a plane that has normal (0,0,1) and passes through Z=0.
	•	Intersect the ray with that plane each time you move.
	•	No forward/back movement in Z because you’re always on z=0.

⸻

Step 4: Move entire graph when concept node is dragged

If the user drags the center concept node, shift all node positions by the same delta. That means:

// Pseudocode in handlePointerMove for concept node:
if (node.type === 'concept') {
  // Calculate the delta
  const delta = new THREE.Vector3().subVectors(intersectPoint, oldIntersectPoint);
  
  // Shift every node by delta
  layout.nodes.forEach((n) => {
    n.position.add(delta);
  });
} else {
  // Single node’s movement
  node.position.copy(intersectPoint);
}

You can store the positions in some state, or replicate this logic in your “onDrag” callback. Then the lines (connections) will automatically stretch or shrink, because each node’s position is changing.

⸻

Step 5: Final Example

Below is a self-contained ConceptGraph3D that uses an orthographic camera with a radial layout, single-plane drag, and a rule that dragging the concept node moves the entire network. It’s only partially tested in plain code, so adapt as needed:

// ConceptGraph3D.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrthographicCamera, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GraphData } from '../types/graph';
import { generateRadialLayout, Layout3D, Node3D, Connection3D } from '../utils/radialLayout';

interface ConceptGraph3DProps {
  graphData: GraphData;
}

const ConceptGraph3D: React.FC<ConceptGraph3DProps> = ({ graphData }) => {
  const [layout, setLayout] = useState<Layout3D | null>(null);

  useEffect(() => {
    // Generate stable radial layout (no randomness)
    if (graphData) {
      setLayout(generateRadialLayout(graphData));
    }
  }, [graphData]);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas orthographic style={{ background: '#000000' }}>
        {/* OrthographicCamera is optional; Drei’s <OrthographicCamera /> can be used too */}
        {/* If you want an explicit camera: 
           <OrthographicCamera makeDefault position={[0, 0, 100]} near={0.1} far={1000} />
        */}
        <Scene layout={layout} />
        
        {/* OrbitControls that only rotates around Z, no pan, no zoom */}
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          // Force the camera to stay top-down
          minPolarAngle={Math.PI / 2}
          maxPolarAngle={Math.PI / 2}
        />
      </Canvas>
    </div>
  );
};

/** The Scene handles rendering nodes and connections. */
function Scene({ layout }: { layout: Layout3D | null }) {
  if (!layout) return null;

  // Build a map of node positions for quick lookup
  const nodeMap = new Map<string, Node3D>();
  layout.nodes.forEach((n) => nodeMap.set(n.id, n));

  return (
    <group>
      {/* Lines */}
      {layout.connections.map((conn) => {
        const sourceNode = nodeMap.get(conn.source);
        const targetNode = nodeMap.get(conn.target);
        if (!sourceNode || !targetNode) return null;
        return (
          <ConnectionLine
            key={conn.id}
            start={sourceNode.position}
            end={targetNode.position}
            color={conn.color}
            thickness={conn.thickness}
          />
        );
      })}
      {/* Nodes */}
      {layout.nodes.map((node) => (
        <DraggableNode key={node.id} layout={layout} node={node} />
      ))}
    </group>
  );
}

/** Renders a single node + drag logic */
function DraggableNode({ layout, node }: { layout: Layout3D; node: Node3D }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera, raycaster, mouse, size, scene } = useThree();
  
  const [isDragging, setIsDragging] = useState(false);
  const plane = useRef<THREE.Plane>(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));
  const lastIntersect = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.position.copy(node.position);
    }
  }, [node.position]);

  const onPointerDown = (e: any) => {
    e.stopPropagation();
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    // We know the plane is z=0, so no need for setFromNormalAndCoplanarPoint repeatedly
    // Instead, we just store the initial intersection point
    const pt = getPlaneIntersection(e);
    if (pt) {
      lastIntersect.current = pt;
    }
    document.body.style.cursor = 'grabbing';
  };

  const onPointerMove = (e: any) => {
    if (!isDragging) return;
    e.stopPropagation();

    const pt = getPlaneIntersection(e);
    if (!pt || !lastIntersect.current) return;

    // delta = current intersection minus last intersection
    const delta = new THREE.Vector3().subVectors(pt, lastIntersect.current);

    if (node.type === 'concept') {
      // Move the entire graph by delta
      layout.nodes.forEach((n) => {
        n.position.add(delta);
      });
    } else {
      // Move just this one node
      node.position.add(delta);
    }

    // Update lastIntersect
    lastIntersect.current.copy(pt);
  };

  const onPointerUp = (e: any) => {
    e.stopPropagation();
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    document.body.style.cursor = 'auto';
  };

  /** Helper to get intersection with Z=0 plane */
  const getPlaneIntersection = (evt: any): THREE.Vector3 | null => {
    // ThreeEvent<PointerEvent> or so, but we can just use e.intersections sometimes
    // but let's do it the manual way:

    // [1] set up raycaster from mouse coords
    // R3F usually does this automatically, but let's be explicit
    const { x, y } = evt.pointer; // or e.offsetX/e.offsetY
    // If not available, we can do something like:
    // const normalized = new THREE.Vector2(
    //   (e.clientX / size.width) * 2 - 1,
    //   -(e.clientY / size.height) * 2 + 1
    // );
    // raycaster.setFromCamera(normalized, camera);

    // In newer R3F versions, e.ray should exist. If so, we can do:
    if (!evt.ray) return null; 
    const localRay = evt.ray;

    const intersection = new THREE.Vector3();
    if (localRay.intersectPlane(plane.current, intersection)) {
      return intersection;
    }
    return null;
  };

  return (
    <mesh
      ref={meshRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <sphereGeometry args={[node.radius, 32, 32]} />
      <meshBasicMaterial color={node.color} />
    </mesh>
  );
}

/** A simple line component in R3F to connect two points. */
function ConnectionLine({
  start,
  end,
  color = '#999',
  thickness = 0.05
}: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  color?: string;
  thickness?: number;
}) {
  // We can either use <line> or a library (like drei's Line).
  // For a simple solution, let's do Drei <Line>:
  //   <Line points={[start, end]} color={color} lineWidth={thickness} />
  // But we must pass arrays. Also note, for <Line> to show thickness, we need <meshLineMaterial> behind the scenes
  // Alternatively, we can do a <line geometry> with lineBasicMaterial.

  const startArr = [start.x, start.y, start.z];
  const endArr = [end.x, end.y, end.z];

  return (
    // from @react-three/drei
    <group>
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={2}
            array={new Float32Array([...startArr, ...endArr])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={color} />
      </line>
    </group>
  );
}

export default ConceptGraph3D;

Key Things to Notice
	1.	Orthographic:
	•	<Canvas orthographic style={{ ... }}> or <OrthographicCamera makeDefault ... />.
	•	No perspective distortion.
	2.	OrbitControls:
	•	We allow rotation around the Z-axis only by setting minPolarAngle={Math.PI/2} maxPolarAngle={Math.PI/2}, enableZoom={false}, enablePan={false}. That means you can “spin” the layout like a platter.
	3.	Single-plane drag (Z=0):
	•	We define plane.current = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0) so it’s always the XY plane.
	•	On pointer move, we do ray.intersectPlane(...) to find where the cursor is on that plane. No movement in Z.
	4.	Moving the entire graph:
	•	If it’s the concept node, we add the delta to every node in layout.nodes.
	5.	Line Updates:
	•	Because each ConnectionLine reads start & end from node positions, they update automatically when a node’s position changes.

⸻

Tuning & Next Steps
	1.	Node Sizes: In radialLayout.ts, just change CONCEPT_NODE_SIZE or PAGE_NODE_SIZE.
	2.	Ring Radius: Change PAGE_RING_RADIUS.
	3.	Camera Distance: If the graph is too small or big, adjust the orthographic camera’s position={[0, 0, 100]} or you can adjust zoom if using <OrthographicCamera>.
	4.	Line Thickness: You can integrate a library like [drei’s <Line> with lineWidth](https://github.com/pmndrs/drei#line) if you want thick lines in an orthographic scene. Plain ` can appear 1px wide no matter the camera.
	5.	Min/Max Polar Angle: If you want full 360° rotation, set minPolarAngle={0} and maxPolarAngle={Math.PI}. But that would let you flip it upside down.
	6.	Tooltips: Continue to use pointerOver, pointerOut.
	7.	No random distribution: Our example uses a stable radial formula each time.

With this approach, you’ll get:
	•	A flat (orthographic) radial layout.
	•	A stable arrangement (no randomness).
	•	The ability to rotate the entire layout around the Z-axis by dragging the mouse.
	•	Single-plane dragging for each node, so it doesn’t jump in Z.
	•	Lines that stretch/shrink with node movement.
	•	The entire graph moves if you drag the concept node.

Give that a try, and adjust any numeric values (sizes, radius, camera positions) to fine-tune the look!