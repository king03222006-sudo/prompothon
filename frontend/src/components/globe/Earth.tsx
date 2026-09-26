import { useRef, useMemo } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { TextureLoader } from "three";

const EARTH_DAY = "https://cdn.jsdelivr.net/npm/three-globe@2.31.0/example/img/earth-blue-marble.jpg";
const EARTH_NIGHT = "https://cdn.jsdelivr.net/npm/three-globe@2.31.0/example/img/earth-night.jpg";
const EARTH_TOPO = "https://cdn.jsdelivr.net/npm/three-globe@2.31.0/example/img/earth-topology.png";
const EARTH_WATER = "https://cdn.jsdelivr.net/npm/three-globe@2.31.0/example/img/earth-water.png";
const CLOUDS = "https://threejs.org/examples/textures/planets/earth_clouds_1024.png";

// Custom shader blending day/night based on sun direction
const earthVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const earthFragmentShader = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D specMap;
  uniform sampler2D topoMap;
  uniform vec3 sunDirection;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 n = normalize(vNormal);
    // world-space normal approximation using transformed sphere normal
    vec3 worldN = normalize(vWorldPos);
    float sunDot = dot(worldN, normalize(sunDirection));
    float dayAmount = smoothstep(-0.15, 0.25, sunDot);

    vec3 dayCol = texture2D(dayMap, vUv).rgb;
    vec3 nightCol = texture2D(nightMap, vUv).rgb;

    // boost city lights
    nightCol = pow(nightCol, vec3(0.85)) * 1.4;
    nightCol += vec3(1.0, 0.75, 0.35) * pow(max(nightCol.r, 0.0), 2.0) * 0.6;

    // ocean spec for highlights
    float water = texture2D(specMap, vUv).r;

    vec3 color = mix(nightCol * 0.9, dayCol, dayAmount);

    // sunset warm band
    float band = smoothstep(0.0, 0.2, sunDot) * (1.0 - smoothstep(0.2, 0.5, sunDot));
    color += vec3(1.0, 0.45, 0.2) * band * 0.25;

    // ocean specular highlight on day side
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 halfDir = normalize(viewDir + normalize(sunDirection));
    float spec = pow(max(dot(worldN, halfDir), 0.0), 60.0) * water * dayAmount;
    color += vec3(0.6, 0.8, 1.0) * spec * 0.8;

    // subtle topo shadowing
    float topo = texture2D(topoMap, vUv).r;
    color *= 0.85 + topo * 0.25;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const atmosphereVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const atmosphereFragmentShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  uniform vec3 glowColor;
  uniform vec3 dawnColor;
  uniform vec3 sunDirection;
  uniform float power;
  uniform float intensity;
  void main() {
    vec3 worldN = normalize(vWorldPos);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fres = pow(1.0 - max(dot(viewDir, worldN), 0.0), power);

    float sunDot = dot(worldN, normalize(sunDirection));
    // refractive scattering: brightest where sunlight grazes the limb
    float scatter = smoothstep(-0.35, 0.6, sunDot);
    // narrow warm dawn band exactly at terminator
    float dawn = smoothstep(-0.05, 0.05, sunDot) * (1.0 - smoothstep(0.05, 0.25, sunDot));

    vec3 col = mix(glowColor * 0.15, glowColor, scatter);
    col += dawnColor * dawn * 0.35;

    float alpha = fres * intensity * (0.25 + scatter * 0.85);
    gl_FragColor = vec4(col, 1.0) * alpha;
  }
`;

export function Earth({ radius = 1, sunDirection }: { radius?: number; sunDirection: THREE.Vector3 }) {
  const earthRef = useRef<THREE.Mesh>(null!);
  const cloudsRef = useRef<THREE.Mesh>(null!);
  const groupRef = useRef<THREE.Group>(null!);

  const [day, night, topo, water, clouds] = useLoader(TextureLoader, [
    EARTH_DAY,
    EARTH_NIGHT,
    EARTH_TOPO,
    EARTH_WATER,
    CLOUDS,
  ]);

  useMemo(() => {
    [day, night, topo, water, clouds].forEach((t) => {
      t.anisotropy = 8;
      t.colorSpace = THREE.SRGBColorSpace;
    });
  }, [day, night, topo, water, clouds]);

  const uniforms = useMemo(
    () => ({
      dayMap: { value: day },
      nightMap: { value: night },
      specMap: { value: water },
      topoMap: { value: topo },
      sunDirection: { value: sunDirection.clone() },
    }),
    [day, night, water, topo, sunDirection],
  );

  const atmoUniforms = useMemo(
    () => ({
      glowColor: { value: new THREE.Color("#2a5a8c") },
      dawnColor: { value: new THREE.Color("#ff8a4a") },
      sunDirection: { value: sunDirection.clone() },
      power: { value: 3.4 },
      intensity: { value: 0.55 },
    }),
    [sunDirection],
  );

  const innerAtmoUniforms = useMemo(
    () => ({
      glowColor: { value: new THREE.Color("#5a9ed6") },
      dawnColor: { value: new THREE.Color("#ffb070") },
      sunDirection: { value: sunDirection.clone() },
      power: { value: 6.5 },
      intensity: { value: 0.4 },
    }),
    [sunDirection],
  );

  useFrame((_, dt) => {
    // clouds drift slightly faster than the earth spin handled by the parent group
    if (cloudsRef.current) cloudsRef.current.rotation.y += dt * 0.008;
    uniforms.sunDirection.value.copy(sunDirection);
    atmoUniforms.sunDirection.value.copy(sunDirection);
    innerAtmoUniforms.sunDirection.value.copy(sunDirection);
  });

  return (
    <group ref={groupRef}>
      {/* Earth */}
      <mesh ref={earthRef}>
        <sphereGeometry args={[radius, 128, 128]} />
        <shaderMaterial
          vertexShader={earthVertexShader}
          fragmentShader={earthFragmentShader}
          uniforms={uniforms}
        />
      </mesh>

      {/* Clouds */}
      <mesh ref={cloudsRef} scale={1.012}>
        <sphereGeometry args={[radius, 96, 96]} />
        <meshPhongMaterial
          map={clouds}
          transparent
          opacity={0.35}
          depthWrite={false}
          blending={THREE.NormalBlending}
        />
      </mesh>

      {/* Inner atmosphere rim */}
      <mesh scale={1.025}>
        <sphereGeometry args={[radius, 64, 64]} />
        <shaderMaterial
          vertexShader={atmosphereVertexShader}
          fragmentShader={atmosphereFragmentShader}
          uniforms={innerAtmoUniforms}
          blending={THREE.AdditiveBlending}
          transparent
          depthWrite={false}
        />
      </mesh>

      {/* Outer atmosphere glow */}
      <mesh scale={1.18}>
        <sphereGeometry args={[radius, 64, 64]} />
        <shaderMaterial
          vertexShader={atmosphereVertexShader}
          fragmentShader={atmosphereFragmentShader}
          uniforms={atmoUniforms}
          blending={THREE.AdditiveBlending}
          transparent
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  );
}
