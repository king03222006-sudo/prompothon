import { useEffect, useState, useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Text } from "@react-three/drei";

/* ─── types ──────────────────────────────────────────────────────────────── */

interface StateRaw {
  name: string;
  lat: number;
  lng: number;
}

interface StateNode {
  name: string;
  pos: THREE.Vector3;   // on unit sphere surface
  norm: THREE.Vector3;  // same, used for dot-product culling
  quat: THREE.Quaternion; // pre-computed rotation to lay text flat
}

/* ─── helpers ────────────────────────────────────────────────────────────── */

const _up = new THREE.Vector3(0, 1, 0);
const _q  = new THREE.Quaternion();

function latLngToVector3(lat: number, lng: number, r: number): THREE.Vector3 {
  const phi   = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  );
}

function buildNode(raw: StateRaw, r: number): StateNode {
  const pos  = latLngToVector3(raw.lat, raw.lng, r + 0.003);
  const norm = pos.clone().normalize();
  // Orient text so it lies flat on the sphere surface facing outward
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    norm,
  );
  return { name: raw.name, pos, norm, quat };
}

/**
 * Greedy angular-distance deduplication.
 * Iterates sorted candidates (best first) and skips any that are within
 * `minAngleDeg` of an already-accepted label.
 */
function deduplicateByAngle(
  nodes: StateNode[],
  camDir: THREE.Vector3,
  minAngleDeg: number,
  maxCount: number,
): StateNode[] {
  const minCos = Math.cos(minAngleDeg * (Math.PI / 180));
  const accepted: StateNode[] = [];
  const acceptedNorms: THREE.Vector3[] = [];

  for (const node of nodes) {
    if (accepted.length >= maxCount) break;

    let tooClose = false;
    for (const an of acceptedNorms) {
      if (node.norm.dot(an) > minCos) { tooClose = true; break; }
    }
    if (!tooClose) {
      accepted.push(node);
      acceptedNorms.push(node.norm);
    }
  }
  return accepted;
}

/* ─── component ──────────────────────────────────────────────────────────── */

const _camDir  = new THREE.Vector3();
const _camPos  = new THREE.Vector3();

export function StateLabels({ radius = 1 }: { radius?: number }) {
  const [allNodes, setAllNodes] = useState<StateNode[]>([]);
  const [visible, setVisible]   = useState<StateNode[]>([]);
  const [fontSize, setFontSize] = useState(0.011);

  const lastUpdate = useRef(0);
  const prevDist   = useRef<number | null>(null);

  /* Load states.json once */
  useEffect(() => {
    fetch("/states.json")
      .then((r) => r.json())
      .then((data: StateRaw[]) => {
        const nodes = data
          .filter((s) => s.name && Number.isFinite(s.lat) && Number.isFinite(s.lng))
          .map((s) => buildNode(s, radius));
        setAllNodes(nodes);
      })
      .catch(console.warn);
  }, [radius]);

  /* Per-frame culling — throttled to every 400 ms */
  useFrame((state, _, xr) => {
    const now = state.clock.elapsedTime;
    if (now - lastUpdate.current < 0.4) return; // 400 ms throttle
    lastUpdate.current = now;

    _camPos.copy(state.camera.position);
    const dist = _camPos.length();

    // ── zoom thresholds ──────────────────────────────────────────────────
    // minDistance = 1.6 (OrbitControls), maxDistance = 6.
    // Only show labels at dist < 2.3 (meaningfully zoomed in)
    if (dist >= 2.3) {
      if (visible.length > 0) setVisible([]);
      prevDist.current = dist;
      return;
    }

    // ── parameters driven by camera distance ──────────────────────────
    // Closer to globe  → show fewer but clearer labels, tighter dedup.
    // dist range: [1.6 … 2.3]  →  t range: [0 … 1]
    const t = (dist - 1.6) / (2.3 - 1.6); // 0 = closest, 1 = threshold

    // Min angular separation between labels (degrees)
    // Closer: 5°  (tight area, fewer labels visible)
    // Further: 8° (large area, need more spacing)
    const minAngleDeg = 5 + t * 3;           // 5 → 8 degrees

    // Max labels
    const maxCount = Math.round(40 + t * 30); // 40 → 70

    // Font size — smaller when further so text doesn't bleed into each other
    const fs = 0.009 + (1 - t) * 0.003;      // 0.009 → 0.012
    if (Math.abs(fs - fontSize) > 0.0005) setFontSize(fs);

    // ── hemisphere culling ────────────────────────────────────────────
    _camDir.copy(_camPos).normalize();

    const facing = allNodes.filter((n) => n.norm.dot(_camDir) > 0.18);

    // Sort: highest dot first (most centered on screen = most legible)
    facing.sort((a, b) => b.norm.dot(_camDir) - a.norm.dot(_camDir));

    const next = deduplicateByAngle(facing, _camDir, minAngleDeg, maxCount);

    // Only update React state if set actually changed (by count or first item)
    if (
      next.length !== visible.length ||
      (next[0] && visible[0] && next[0].name !== visible[0].name)
    ) {
      setVisible(next);
    }

    prevDist.current = dist;
  });

  /* Stable render — only re-memo when visible set identity changes */
  const labels = useMemo(() =>
    visible.map((node, i) => (
      <group key={node.name + i} position={node.pos} quaternion={node.quat}>
        <Text
          fontSize={fontSize}
          color="#c8dfff"
          anchorX="center"
          anchorY="middle"
          renderOrder={5}
          depthTest={false}
          outlineWidth={0.0008}
          outlineColor="#00000088"
          strokeWidth={0}
        >
          {node.name}
        </Text>
      </group>
    )),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [visible, fontSize]);

  return <group>{labels}</group>;
}
