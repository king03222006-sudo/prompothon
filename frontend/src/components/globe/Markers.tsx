import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { latLngToVec3, KIND_COLORS } from "./geo";
import { useEventsStore } from "../../hooks/useEventsStore";
import { useMarkersStore } from "../../hooks/useMarkersStore";
import { useSelectionStore } from "../../hooks/useSelectionStore";
import { LiveEvent } from "../../lib/api/live-data";
import type { Marker } from "../../hooks/useMarkersStore";

/* ─── Disaster event pulse ring ─────────────────────────────────────────────── */

function PulseRing({
  position,
  color,
  scale = 1,
  speed = 1,
}: {
  position: THREE.Vector3;
  color: string;
  scale?: number;
  speed?: number;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  const matRef = useRef<THREE.MeshBasicMaterial>(null!);
  useFrame(({ clock }) => {
    const t = (clock.elapsedTime * speed) % 2;
    const s = 0.02 + t * 0.12 * scale;
    if (ref.current) ref.current.scale.setScalar(s);
    if (matRef.current) matRef.current.opacity = Math.max(0, 1 - t / 2);
  });
  const up = position.clone().normalize();
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
  return (
    <mesh ref={ref} position={position} quaternion={quat}>
      <ringGeometry args={[0.8, 1, 64]} />
      <meshBasicMaterial
        ref={matRef}
        color={color}
        transparent
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

/* ─── Disaster event marker dot ─────────────────────────────────────────────── */

const HAZARD_COLORS: Record<string, string> = {
  earthquake: "#ff3344",
  wildfire:   "#ff7a20",
  storm:      "#a78bfa",
  volcano:    "#ef4444",
  flood:      "#38bdf8",
  other:      "#94a3b8",
};

function MarkerDot({
  event,
  radius,
  isSelected,
  onToggle,
}: {
  event: LiveEvent;
  radius: number;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const pos = latLngToVec3(event.coords[0], event.coords[1], radius * 1.005);
  const hexColor = HAZARD_COLORS[event.hazardType] ?? HAZARD_COLORS.other;
  const glowOpacity =
    event.severity === "Critical" ? 0.5 : event.severity === "High" ? 0.35 : 0.2;
  const isDanger = event.severity === "Critical" || event.severity === "High";

  const dotRef = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (dotRef.current) {
      const p = 1 + Math.sin(clock.elapsedTime * 2 + event.coords[0]) * 0.15;
      dotRef.current.scale.setScalar(p);
    }
  });

  return (
    <group>
      {/* Visible dot */}
      <mesh ref={dotRef} position={pos}>
        <sphereGeometry args={[0.012, 16, 16]} />
        <meshBasicMaterial
          color={isSelected ? "#ffffff" : hexColor}
          toneMapped={false}
        />
      </mesh>
      {/* Outer glow */}
      <mesh position={pos}>
        <sphereGeometry args={[isSelected ? 0.038 : 0.022, 16, 16]} />
        <meshBasicMaterial
          color={hexColor}
          transparent
          opacity={isSelected ? 0.55 : glowOpacity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Pulse rings */}
      <PulseRing
        position={pos}
        color={hexColor}
        scale={isDanger ? 1.4 : 0.7}
        speed={isDanger ? 1.1 : 0.6}
      />
      {isDanger && <PulseRing position={pos} color={hexColor} scale={1.8} speed={0.8} />}

      {/* Invisible large hit sphere for easy click detection */}
      <mesh
        position={pos}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "default")}
      >
        <sphereGeometry args={[0.055, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ─── Geo location pin ───────────────────────────────────────────────────────── */

function GeoPin({
  marker,
  radius,
  isSelected,
  onToggle,
}: {
  marker: Marker;
  radius: number;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const pos = latLngToVec3(marker.lat, marker.lng, radius * 1.007);
  const color = KIND_COLORS[marker.kind] ?? "#94a3b8";

  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (ref.current) {
      const p = 1 + Math.sin(clock.elapsedTime * 1.2 + marker.lat) * 0.08;
      ref.current.scale.setScalar(p);
    }
  });

  return (
    <group>
      {/* Core pin */}
      <mesh ref={ref} position={pos}>
        <octahedronGeometry args={[0.016, 0]} />
        <meshBasicMaterial
          color={isSelected ? "#ffffff" : color}
          toneMapped={false}
        />
      </mesh>
      {/* Soft glow */}
      <mesh position={pos}>
        <sphereGeometry args={[isSelected ? 0.04 : 0.028, 12, 12]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isSelected ? 0.5 : 0.18}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Hit sphere */}
      <mesh
        position={pos}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "default")}
      >
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ─── Combined Markers component ─────────────────────────────────────────────── */

export function Markers({ radius }: { radius: number }) {
  const { events } = useEventsStore();
  const { markers } = useMarkersStore();
  const { selected, toggleSelect } = useSelectionStore();

  return (
    <group>
      {events.map((e) => (
        <MarkerDot
          key={e.id}
          event={e}
          radius={radius}
          isSelected={selected?.type === "event" && selected.id === e.id}
          onToggle={() => toggleSelect({ type: "event", id: e.id })}
        />
      ))}
      {markers.map((m) => (
        <GeoPin
          key={m.id}
          marker={m}
          radius={radius}
          isSelected={selected?.type === "geoMarker" && selected.id === m.id}
          onToggle={() => toggleSelect({ type: "geoMarker", id: m.id })}
        />
      ))}
    </group>
  );
}
