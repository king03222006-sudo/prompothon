import { useMemo } from "react";
import * as THREE from "three";

const vert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// FBM noise-based nebula glow on a far sphere
const frag = /* glsl */ `
  varying vec3 vDir;

  float hash(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float noise(vec3 x){
    vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                   mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                   mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  float fbm(vec3 p){ float v=0.0; float a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.02; a*=0.5; } return v; }

  void main() {
    vec3 d = normalize(vDir);
    float n = fbm(d * 2.5);
    float n2 = fbm(d * 6.0 + 13.0);
    vec3 cool = vec3(0.05, 0.12, 0.35);
    vec3 warm = vec3(0.35, 0.08, 0.25);
    vec3 col = mix(cool, warm, smoothstep(0.3, 0.8, n2));
    float mask = smoothstep(0.35, 0.85, n);
    col *= mask * 0.6;
    // milky-way band
    float band = exp(-pow((d.y - 0.05) * 4.0, 2.0));
    col += vec3(0.25, 0.3, 0.55) * band * (0.3 + 0.7 * n2);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function Nebula() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
      }),
    [],
  );
  return (
    <mesh material={mat} renderOrder={-2}>
      <sphereGeometry args={[80, 32, 32]} />
    </mesh>
  );
}
