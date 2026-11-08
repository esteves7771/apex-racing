import { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  RigidBody,
  CuboidCollider,
  CylinderCollider,
  useBeforePhysicsStep,
  type RapierRigidBody,
  type CollisionEnterPayload,
} from '@react-three/rapier';
import * as THREE from 'three';
import { obstacleLayout, obstaclePhysics } from '../game/ObstacleLayout';
import { race, telemetry, useGame } from '../game/store';
import { audioManager } from '../audio/AudioManager';
const box = new THREE.BoxGeometry(1, 1, 1),
  cone = new THREE.ConeGeometry(0.34, 0.83, 8),
  barrel = new THREE.CylinderGeometry(0.52, 0.52, 1.3, 12);
function Fragments({ p }: { p: { x: number; y: number; z: number } }) {
  const ref = useRef<THREE.Group>(null),
    age = useRef(0);
  const reduced = useGame(
    (s) => s.save.settings.reducedMotion || s.save.settings.effects === 'low',
  );
  useFrame((_, dt) => {
    if (race.phase === 'PAUSED') return;
    age.current += dt;
    if (ref.current) {
      ref.current.visible = age.current < 1.1;
      ref.current.children.forEach((child, i) => {
        const t = age.current,
          a = (i * Math.PI) / 3;
        child.position.set(
          Math.cos(a) * t * 2,
          Math.max(-0.4, 1.8 * t - 4 * t * t),
          Math.sin(a) * t * 2,
        );
        child.rotation.set(t * (i + 1), 0, t * 2);
        const shrink = Math.max(0, 1 - t / 1.2);
        child.scale.set(0.45 * shrink, 0.2 * shrink, 0.3 * shrink);
      });
    }
  });
  return (
    <group ref={ref} position={[p.x, p.y, p.z]}>
      {Array.from({ length: reduced ? 3 : 6 }, (_, i) => (
        <mesh key={i} geometry={box} scale={[0.45, 0.2, 0.3]}>
          <meshStandardMaterial color={i % 2 ? '#a77d4c' : '#d6b57a'} />
        </mesh>
      ))}
    </group>
  );
}
function Obstacle({ item }: { item: (typeof obstacleLayout)[number] }) {
  const body = useRef<RapierRigidBody>(null),
    [broken, setBroken] = useState<{ x: number; y: number; z: number } | null>(null),
    config = obstaclePhysics[item.type];
  const data = useMemo(() => ({ kind: 'obstacle', id: item.id }), [item.id]);
  const velocity = useRef({ x: 0, z: 0 });
  const pending = useRef<{ exit: boolean; speed: number }[]>([]);
  useBeforePhysicsStep(() => {
    if (body.current?.isValid()) {
      const v = body.current.linvel();
      velocity.current.x = v.x;
      velocity.current.z = v.z;
    }
  });
  const impact = (e: CollisionEnterPayload) => {
    if ((e.other.rigidBody?.userData as { kind?: string })?.kind !== 'car') return;
    const speed = Math.hypot(
      telemetry.velocityX - velocity.current.x,
      telemetry.velocityZ - velocity.current.z,
    );
    if (pending.current.length < 4) pending.current.push({ exit: false, speed });
  };
  // Rapier invokes collision handlers while its contact manifold is borrowed. Never
  // mutate React/physics ownership there: consume a bounded queue after Physics returns.
  useFrame(() => {
    for (const event of pending.current) {
      if (event.exit) {
        race.releaseImpact(item.id);
        continue;
      }
      if (race.impact(item.id, item.type, event.speed)) {
        audioManager.play(item.type, Math.min(1, event.speed / 12));
        if (item.type === 'crate' && body.current?.isValid()) {
          const p = { ...body.current.translation() };
          // Rapier's forwarded ref outlives the conditional RigidBody. Clear it
          // before removal so the retained pre-step hook cannot query a freed handle.
          body.current = null;
          setBroken(p);
        }
        useGame.getState().publish();
      }
    }
    pending.current.length = 0;
  });
  if (broken) return <Fragments p={broken} />;
  return (
    <RigidBody
      ref={body}
      position={[item.p.x, item.p.y, item.p.z]}
      rotation={[0, item.yaw, 0]}
      colliders={false}
      ccd
      canSleep
      linearDamping={0.6}
      angularDamping={0.8}
      onCollisionEnter={impact}
      onCollisionExit={(e) => {
        if (
          (e.other.rigidBody?.userData as { kind?: string })?.kind === 'car' &&
          pending.current.length < 4
        )
          pending.current.push({ exit: true, speed: 0 });
      }}
      userData={data}
    >
      {item.type === 'barrel' ? (
        <CylinderCollider
          args={[0.65, 0.53]}
          mass={config.mass}
          friction={0.5}
          restitution={0.08}
        />
      ) : (
        <CuboidCollider
          args={[...config.half]}
          mass={config.mass}
          friction={0.5}
          restitution={0.05}
        />
      )}
      {item.type === 'cone' ? (
        <>
          <mesh geometry={cone} position={[0, -0.02, 0]} castShadow>
            <meshStandardMaterial color="#ed805d" />
          </mesh>
          <mesh geometry={box} scale={[0.7, 0.12, 0.7]} position={[0, -0.42, 0]}>
            <meshStandardMaterial color="#344b50" />
          </mesh>
          <mesh position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.18, 0.23, 0.14, 8]} />
            <meshStandardMaterial color="#fff2d5" />
          </mesh>
        </>
      ) : item.type === 'barrel' ? (
        <>
          <mesh geometry={barrel} castShadow>
            <meshStandardMaterial color="#60b8c4" roughness={0.65} />
          </mesh>
          {[-0.4, 0.4].map((y) => (
            <mesh key={y} position={[0, y, 0]}>
              <cylinderGeometry args={[0.54, 0.54, 0.1, 12]} />
              <meshStandardMaterial color="#edf0d7" />
            </mesh>
          ))}
        </>
      ) : (
        <>
          <mesh geometry={box} scale={[1.3, 1.3, 1.3]} castShadow>
            <meshStandardMaterial color="#c89d67" />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh
              key={s}
              geometry={box}
              position={[0, 0, s * 0.66]}
              rotation={[0, 0, 0.75]}
              scale={[0.13, 1.55, 0.035]}
            >
              <meshStandardMaterial color="#896742" />
            </mesh>
          ))}
        </>
      )}
    </RigidBody>
  );
}
export function Obstacles() {
  useGame((s) => s.revision);
  return race.mode === 'challenge' &&
    ['COUNTDOWN', 'RACING', 'PAUSED', 'RESULTS'].includes(race.phase) ? (
    <group key={race.runId}>
      {obstacleLayout.map((item) => (
        <Obstacle key={item.id} item={item} />
      ))}
    </group>
  ) : null;
}
