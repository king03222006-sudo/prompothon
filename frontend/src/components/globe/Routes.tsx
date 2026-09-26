import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { greatCircleCurve, latLngToVec3, ROUTE_COLORS } from "./geo";
import { useRoutesStore } from "../../hooks/useRoutesStore";
import { useSelectionStore } from "../../hooks/useSelectionStore";
import type { Route } from "../../hooks/useRoutesStore";

function RouteArc({
  route,
  radius,
  offset,
  isSelected,
  onToggle,
}: {
  route: Route;
  radius: number;
  offset: number;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const color = ROUTE_COLORS[route.kind];

  const curve = useMemo(
    () =>
      greatCircleCurve(
        latLngToVec3(route.from[0], route.from[1], radius * 1.005),
        latLngToVec3(route.to[0], route.to[1], radius * 1.005),
        0.4,
      ),
    [route.from, route.to, radius],
  );

  const particleRef      = useRef<THREE.Mesh>(null!);
  const particleTrailRef = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    const t = (clock.elapsedTime * 0.18 + offset) % 1;
    const p  = curve.getPointAt(t);
    const p2 = curve.getPointAt(Math.max(0, t - 0.02));
    if (particleRef.current) particleRef.current.position.copy(p);
    if (particleTrailRef.current) particleTrailRef.current.position.copy(p2);
  });

  return (
    <group>
      {/* Glow tube — wider when selected */}
      <mesh>
        <tubeGeometry args={[curve, 80, isSelected ? 0.022 : 0.012, 8, false]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isSelected ? 0.45 : 0.18}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Core tube */}
      <mesh>
        <tubeGeometry args={[curve, 80, 0.004, 8, false]} />
        <meshBasicMaterial
          color={isSelected ? "#ffffff" : color}
          transparent
          opacity={isSelected ? 1 : 0.95}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {/* Traveling particle */}
      <mesh ref={particleRef}>
        <sphereGeometry args={[isSelected ? 0.02 : 0.014, 12, 12]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh ref={particleTrailRef}>
        <sphereGeometry args={[isSelected ? 0.03 : 0.022, 12, 12]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.35}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Invisible fat tube — click hit area */}
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "default")}
      >
        <tubeGeometry args={[curve, 40, 0.04, 6, false]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function Routes({ radius }: { radius: number }) {
  const { routes } = useRoutesStore();
  const { selected, toggleSelect } = useSelectionStore();

  return (
    <group>
      {routes.map((r, i) => (
        <RouteArc
          key={r.id}
          route={r}
          radius={radius}
          offset={i * 0.13}
          isSelected={selected?.type === "route" && selected.id === r.id}
          onToggle={() => toggleSelect({ type: "route", id: r.id })}
        />
      ))}
    </group>
  );
}
