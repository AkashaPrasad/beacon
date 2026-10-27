/**
 * The 3D beacon in the hero (lazy chunk): an emissive core inside the mark's open ring, a translucent
 * additive light cone sweeping once every 12 s, two faint orbiting pack rings, and a little pointer
 * parallax. Low-poly, DPR ≤ 1.5, renders only while in view and the tab is visible; under reduced
 * motion it renders one still frame. Writes the beam angle to `beamAngle` for the panel highlight.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import { usePrefersReducedMotion } from '@kestrel/ui';

import { beamAngle } from '../lib/beam';
import { usePageVisible } from '../lib/hooks';

const WARM = '#f2f2f0';
const WARM_DIM = '#d6d6d2';
const REV_SECONDS = 12;

function glowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(242,242,240,0.95)');
  g.addColorStop(0.25, 'rgba(242,242,240,0.45)');
  g.addColorStop(0.6, 'rgba(242,242,240,0.08)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const BEAM_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const BEAM_FRAG = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying vec2 vUv;
  void main() {
    // uv.y = 1 at the apex (the core), 0 at the open end: bright at the source, fading along the length.
    float along = pow(vUv.y, 1.6);
    // Soft edges around the cone's circumference.
    float rim = 1.0 - abs(fract(vUv.x + 0.25) * 2.0 - 1.0);
    rim = smoothstep(0.0, 0.55, rim);
    float a = along * rim * 0.34;
    vec3 col = mix(uColorB, uColorA, vUv.y);
    gl_FragColor = vec4(col * a, a);
  }
`;

function Scene({ active, reduced }: { active: boolean; reduced: boolean }) {
  const rig = useRef<THREE.Group>(null);
  const beamRig = useRef<THREE.Group>(null);
  const rings = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const { invalidate, pointer, viewport } = useThree();
  // Sit in the top-right of the hero (world units), smaller on phones, never over the headline.
  const phone = viewport.width < 4.6;
  const placement = useMemo(
    () => ({
      // Desktop: the centre of the right column (≈ 72 % across), one ring-radius below the top edge.
      x: phone ? viewport.width / 2 - 0.5 : viewport.width * 0.22,
      y: phone ? viewport.height / 2 - 0.3 : viewport.height / 2 - 1.55,
      scale: phone ? 0.26 : 0.62,
    }),
    [viewport.width, viewport.height, phone],
  );
  const glow = useMemo(() => glowTexture(), []);
  const beamMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColorA: { value: new THREE.Color(WARM) },
          uColorB: { value: new THREE.Color(WARM_DIM) },
        },
        vertexShader: BEAM_VERT,
        fragmentShader: BEAM_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const beamGeo = useMemo(() => {
    const h = 5.5;
    const geo = new THREE.ConeGeometry(1.35, h, 48, 1, true);
    // Apex at the origin, opening along −Y; the mesh is rotated so it opens along +X.
    geo.translate(0, -h / 2, 0);
    return geo;
  }, []);

  useEffect(() => {
    if (reduced) {
      beamRig.current?.rotation.set(0, Math.PI * 1.05, 0);
      beamAngle.set(Math.PI * 1.05);
      invalidate();
    }
  }, [reduced, invalidate]);

  useFrame((state, delta) => {
    if (!active) return;
    const t = state.clock.getElapsedTime();
    if (beamRig.current) {
      const angle = ((t / REV_SECONDS) * Math.PI * 2) % (Math.PI * 2);
      beamRig.current.rotation.y = angle;
      beamAngle.set(angle);
    }
    if (rings.current) {
      rings.current.rotation.y += delta * 0.08;
      rings.current.rotation.x = Math.sin(t * 0.2) * 0.1;
    }
    if (core.current) {
      const s = 1 + Math.sin(t * 1.6) * 0.04;
      core.current.scale.setScalar(s);
    }
    if (rig.current) {
      // Pointer parallax: a few degrees, eased.
      const tx = -pointer.y * 0.12;
      const ty = pointer.x * 0.18;
      rig.current.rotation.x += (tx - rig.current.rotation.x) * Math.min(1, delta * 3);
      rig.current.rotation.y += (ty - rig.current.rotation.y) * Math.min(1, delta * 3);
      rig.current.position.y = placement.y + Math.sin(t * 0.5) * 0.06;
    }
  });

  return (
    <group ref={rig} position={[placement.x, placement.y, 0]} scale={placement.scale}>
      <ambientLight intensity={0.25} />
      <pointLight color={WARM} intensity={3} distance={6} decay={2} />
      {/* Core */}
      <mesh ref={core}>
        <sphereGeometry args={[0.2, 32, 32]} />
        <meshStandardMaterial
          color={WARM}
          emissive={WARM}
          emissiveIntensity={1.4}
          roughness={0.4}
          toneMapped={false}
        />
      </mesh>
      <sprite scale={[3.2, 3.2, 1]}>
        <spriteMaterial
          map={glow}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          transparent
          opacity={0.42}
        />
      </sprite>
      {/* The mark's open ring */}
      <mesh rotation={[Math.PI / 2.35, 0, Math.PI * 0.62]}>
        <torusGeometry args={[0.95, 0.02, 12, 160, Math.PI * 1.72]} />
        <meshBasicMaterial color={WARM} transparent opacity={0.85} toneMapped={false} />
      </mesh>
      {/* Beam */}
      <group ref={beamRig} rotation={[0, Math.PI * 1.05, 0]}>
        <mesh
          geometry={beamGeo}
          material={beamMat}
          rotation={[0, 0, Math.PI / 2]}
          position={[0.25, 0.02, 0]}
        />
      </group>
      {/* Orbiting pack rings */}
      <group ref={rings}>
        <mesh rotation={[Math.PI / 2.2, 0.4, 0]}>
          <torusGeometry args={[1.55, 0.007, 8, 180]} />
          <meshBasicMaterial color={WARM} transparent opacity={0.14} toneMapped={false} />
        </mesh>
        <mesh rotation={[Math.PI / 1.8, -0.5, 0.3]}>
          <torusGeometry args={[2.05, 0.006, 8, 200]} />
          <meshBasicMaterial color={WARM} transparent opacity={0.08} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export default function Beacon3D({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  const host = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  const [ok] = useState(() => webglAvailable());
  useEffect(() => {
    const node = host.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(
      (entries) => setInView(entries.some((e) => e.isIntersecting)),
      { rootMargin: '10% 0px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);
  if (!ok) return null;
  const active = inView && visible && !reduced;
  return (
    <div ref={host} className={className} aria-hidden="true">
      <Canvas
        dpr={[1, 1.5]}
        frameloop={reduced ? 'demand' : active ? 'always' : 'never'}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        camera={{ position: [0, 0, 6.2], fov: 38 }}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      >
        <Scene active={active} reduced={reduced} />
      </Canvas>
    </div>
  );
}
