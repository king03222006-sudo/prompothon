import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export function Satellites({ count = 80, radius = 1 }: { count?: number; radius?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const sats = useMemo(() => {
    return Array.from({ length: count }, () => {
      const r = radius * (1.15 + Math.random() * 0.6);
      const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const phase = Math.random() * Math.PI * 2;
      const speed = 0.08 + Math.random() * 0.18;
      return { r, axis, phase, speed };
    });
  }, [count, radius]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    sats.forEach((s, i) => {
      const angle = s.phase + t * s.speed;
      // create position on plane perpendicular to axis
      const perp = new THREE.Vector3(1, 0, 0);
      if (Math.abs(s.axis.dot(perp)) > 0.9) perp.set(0, 1, 0);
      const u = new THREE.Vector3().crossVectors(s.axis, perp).normalize();
      const v = new THREE.Vector3().crossVectors(s.axis, u).normalize();
      const pos = u.clone().multiplyScalar(Math.cos(angle) * s.r).add(v.clone().multiplyScalar(Math.sin(angle) * s.r));
      dummy.position.copy(pos);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <sphereGeometry args={[0.006, 6, 6]} />
      <meshBasicMaterial color="#9ad8ff" toneMapped={false} />
    </instancedMesh>
  );
}
