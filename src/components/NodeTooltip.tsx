import { Html } from '@react-three/drei';
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PageData } from '../types/graph'; // Assuming PageData is here

interface Props {
  title: string;
  url: string;
  radius: number; // radius of the ball so we can offset nicely
}

const NodeTooltip: React.FC<Props> = ({ title, url, radius }) => {
  const groupRef = useRef<THREE.Group>(null);
  
  // Counter-rotate to keep tooltip facing camera
  useFrame(({ camera }) => {
    if (groupRef.current) {
      // Get parent's world quaternion
      const parentWorldQuaternion = new THREE.Quaternion();
      groupRef.current.parent?.getWorldQuaternion(parentWorldQuaternion);
      
      // Calculate inverse quaternion to cancel parent rotation
      const invParentQuaternion = parentWorldQuaternion.clone().invert();
      
      // Apply to our group
      groupRef.current.quaternion.copy(invParentQuaternion);
    }
  });
  
  return (
    <group ref={groupRef} position={[radius * 1.3, 0, 0]}>
      <Html
        transform /* scales with distance */
        center
        distanceFactor={18}
        wrapperClass="node-tooltip"
        pointerEvents="none" /* << never blocks ray–casting */
      >
        <div className="tooltip-box">
          <h3>{title}</h3>
        </div>
      </Html>
    </group>
  );
};

export default NodeTooltip; 