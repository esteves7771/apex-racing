import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { breakables, routePose } from './CanyonCarnival';
import { race, telemetry, useGame } from '../game/store';
import { audioManager } from '../audio/AudioManager';
function Crate({ item }: { item: (typeof breakables)[number] }) {
  const mesh = useRef<THREE.Group>(null),
    broken = useRef(-1),
    clock = useRef(0),
    pose = useMemo(() => routePose(item.t, item.route, item.lateral), [item]);
  useFrame((_, dt) => {
    if (race.phase === 'PAUSED') return;
    clock.current += dt;
    if (mesh.current) {
      const t = broken.current < 0 ? 0 : clock.current - broken.current;
      mesh.current.visible = t < 2.2;
      mesh.current.position.y =
        pose.p.y + 0.65 + (t > 0 ? Math.sin(Math.min(1, t) * Math.PI) * 0.7 : 0);
      mesh.current.rotation.set(t * 0.7, pose.yaw + t, t * 0.5);
      mesh.current.userData.broken = broken.current >= 0;
      if (t > 0) {
        mesh.current.children[0].position.x = -0.3 - t * 0.7;
        mesh.current.children[1].position.x = 0.3 + t * 0.7;
      }
    }
  });
  return (
    <RigidBody
      type="fixed"
      colliders={false}
      userData={{ kind: 'breakable', id: item.id }}
      position={[pose.p.x, 0, pose.p.z]}
    >
      <CuboidCollider
        sensor
        args={[0.65, 0.65, 0.65]}
        position={[0, pose.p.y + 0.65, 0]}
        onIntersectionEnter={(event) => {
          const kind = (event.other.rigidBody?.userData as { kind?: string })?.kind;
          if (
            (kind === 'car' || kind === 'rival') &&
            broken.current < 0 &&
            race.phase === 'RACING'
          ) {
            broken.current = clock.current;
            event.target.collider.setEnabled(false);
            if (Math.hypot(telemetry.x - pose.p.x, telemetry.z - pose.p.z) < 50)
              audioManager.play('crate', 0.7);
          }
        }}
      />
      <group ref={mesh} name={`canyon-breakable-${item.id}`} position={[0, pose.p.y + 0.65, 0]}>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.3, 0, 0]}>
            <boxGeometry args={[0.56, 1.2, 1.2]} />
            <meshStandardMaterial color={side > 0 ? '#9d643d' : '#d4a16a'} flatShading />
          </mesh>
        ))}
        <mesh>
          <boxGeometry args={[1.25, 0.12, 1.25]} />
          <meshStandardMaterial color="#704734" />
        </mesh>
      </group>
    </RigidBody>
  );
}
export function CanyonProps() {
  useGame((s) => s.revision);
  return (
    <group key={race.runId}>
      {breakables.map((item) => (
        <Crate key={item.id} item={item} />
      ))}
    </group>
  );
}
