import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";

// Natural Earth Admin-0 country borders (medium resolution, ~800 KB)
const COUNTRY_BORDERS_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Admin-1 state/province borders via a public GeoJSON endpoint
// Using geojson from a CDN – medium resolution (~2.5 MB)
const STATE_BORDERS_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces_lines.geojson";

/* Convert lat/lng to a 3D point on a sphere of given radius */
function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

/* Build a BufferGeometry of line segments from a GeoJSON FeatureCollection */
function buildLinesFromGeoJSON(
  geojson: GeoJSON.FeatureCollection | GeoJSON.Feature,
  radius: number,
  elevation = 0.001
): THREE.BufferGeometry {
  const positions: number[] = [];
  const r = radius + elevation;

  function processCoords(coords: number[][]): void {
    for (let i = 0; i < coords.length - 1; i++) {
      const a = latLngToVector3(coords[i][1], coords[i][0], r);
      const b = latLngToVector3(coords[i + 1][1], coords[i + 1][0], r);
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }

  function processGeometry(geom: GeoJSON.Geometry): void {
    if (geom.type === "LineString") {
      processCoords(geom.coordinates as number[][]);
    } else if (geom.type === "MultiLineString") {
      (geom.coordinates as number[][][]).forEach(processCoords);
    } else if (geom.type === "Polygon") {
      (geom.coordinates as number[][][]).forEach(processCoords);
    } else if (geom.type === "MultiPolygon") {
      (geom.coordinates as number[][][][]).forEach((poly) =>
        poly.forEach(processCoords)
      );
    } else if (geom.type === "GeometryCollection") {
      geom.geometries.forEach(processGeometry);
    }
  }

  const features =
    "features" in geojson
      ? geojson.features
      : [geojson as GeoJSON.Feature];

  features.forEach((feat) => {
    if (feat.geometry) processGeometry(feat.geometry);
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  return geo;
}

/* ─── Country borders using built-in TopoJSON via topojson-client ─────────── */

async function fetchCountryBorders(radius: number): Promise<THREE.BufferGeometry | null> {
  try {
    const res = await fetch(
      "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"
    );
    const topo = (await res.json()) as Topology;
    const countries = feature(topo, topo.objects.countries as any) as GeoJSON.FeatureCollection;
    return buildLinesFromGeoJSON(countries, radius, 0.0015);
  } catch (e) {
    console.warn("Country borders failed:", e);
    return null;
  }
}

/* ─── State borders from GeoJSON CDN ─────────────────────────────────────── */

async function fetchStateBorders(radius: number): Promise<THREE.BufferGeometry | null> {
  try {
    const res = await fetch(STATE_BORDERS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const geojson = (await res.json()) as GeoJSON.FeatureCollection;
    return buildLinesFromGeoJSON(geojson, radius, 0.001);
  } catch (e) {
    console.warn("State borders failed:", e);
    return null;
  }
}

/* ─── Component ───────────────────────────────────────────────────────────── */

interface BordersProps {
  radius?: number;
}

export function Borders({ radius = 1 }: BordersProps) {
  const [countryGeo, setCountryGeo] = useState<THREE.BufferGeometry | null>(null);
  const [stateGeo, setStateGeo] = useState<THREE.BufferGeometry | null>(null);
  const countryRef = useRef<THREE.LineSegments>(null!);
  const stateRef = useRef<THREE.LineSegments>(null!);

  useEffect(() => {
    let cancelled = false;

    fetchCountryBorders(radius).then((geo) => {
      if (!cancelled && geo) setCountryGeo(geo);
    });

    fetchStateBorders(radius).then((geo) => {
      if (!cancelled && geo) setStateGeo(geo);
    });

    return () => {
      cancelled = true;
    };
  }, [radius]);

  // Cleanup geometries on unmount
  useEffect(() => {
    return () => {
      countryGeo?.dispose();
      stateGeo?.dispose();
    };
  }, [countryGeo, stateGeo]);

  return (
    <group>
      {/* Country borders — slightly brighter */}
      {countryGeo && (
        <lineSegments ref={countryRef} geometry={countryGeo}>
          <lineBasicMaterial
            color="#5a9ed6"
            transparent
            opacity={0.45}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </lineSegments>
      )}

      {/* State / province borders — subtle, dimmer */}
      {stateGeo && (
        <lineSegments ref={stateRef} geometry={stateGeo}>
          <lineBasicMaterial
            color="#3a7ab8"
            transparent
            opacity={0.22}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </lineSegments>
      )}
    </group>
  );
}
