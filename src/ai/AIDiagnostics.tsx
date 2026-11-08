import { useMemo, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { race, useGame } from '../game/store';
import { navigation, navAt, routeOffset } from './TrackNavigation';
import { usePhysicsDebug } from '../vehicle/physicsDiagnostics';
function Lines() {
  const group = useRef<THREE.Group>(null);
  const dynamic = useMemo(
    () =>
      race.gp.racers.slice(1).map((r) => {
        const beam = new THREE.Line(
          new THREE.BufferGeometry().setAttribute(
            'position',
            new THREE.Float32BufferAttribute(new Float32Array(6), 3),
          ),
          new THREE.LineBasicMaterial({ color: r.color }),
        );
        beam.frustumCulled = false;
        const vertices = [];
        for (let i = 0; i <= 48; i++)
          vertices.push(
            Math.cos((i / 48) * Math.PI * 2) * 45,
            0.15,
            Math.sin((i / 48) * Math.PI * 2) * 45,
          );
        const zone = new THREE.Line(
          new THREE.BufferGeometry().setAttribute(
            'position',
            new THREE.Float32BufferAttribute(vertices, 3),
          ),
          new THREE.LineBasicMaterial({ color: r.color, transparent: true, opacity: 0.25 }),
        );
        return { beam, zone };
      }),
    [],
  );
  const lines = useMemo(() => {
    const make = (offset: number, color: string, route = true) => {
      const vertices = [];
      for (let i = 0; i <= navigation.length; i++) {
        const t = i / navigation.length,
          p = navAt(t, route ? routeOffset(t, offset) : offset);
        vertices.push(p.x, p.y + 0.2, p.z);
      }
      return new THREE.Line(
        new THREE.BufferGeometry().setAttribute(
          'position',
          new THREE.Float32BufferAttribute(vertices, 3),
        ),
        new THREE.LineBasicMaterial({ color }),
      );
    };
    return [
      make(0, '#ffffff', false),
      ...race.gp.racers.slice(1).map((r) => make(r.ai?.rival.lane ?? 0, r.color)),
    ];
  }, []);
  useEffect(
    () => () => {
      for (const line of lines) {
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      }
    },
    [lines],
  );
  useEffect(
    () => () => {
      for (const d of dynamic)
        for (const line of [d.beam, d.zone]) {
          line.geometry.dispose();
          (line.material as THREE.Material).dispose();
        }
    },
    [dynamic],
  );
  useFrame(() => {
    group.current?.children.forEach((o, i) => {
      const r = race.gp.racers[i + 1];
      if (r) {
        o.position.set(r.ai?.target.x ?? r.x, (r.ai?.target.y ?? 0) + 0.5, r.ai?.target.z ?? r.z);
        const d = dynamic[i],
          attr = d.beam.geometry.getAttribute('position');
        attr.setXYZ(0, r.x, (r.ai?.target.y ?? 0) + 0.25, r.z);
        attr.setXYZ(1, o.position.x, o.position.y, o.position.z);
        attr.needsUpdate = true;
        d.zone.position.set(r.x, (r.ai?.target.y ?? 0) + 0.2, r.z);
      }
    });
  });
  return (
    <>
      {lines.map((line, i) => (
        <primitive key={i} object={line} />
      ))}
      {dynamic.map((d, i) => (
        <group key={'dynamic' + i}>
          <primitive object={d.beam} />
          <primitive object={d.zone} />
        </group>
      ))}
      <group ref={group}>
        {race.gp.racers.slice(1).map((r) => (
          <mesh key={r.id}>
            <sphereGeometry args={[0.55, 6, 6]} />
            <meshBasicMaterial color={r.color} />
          </mesh>
        ))}
      </group>
    </>
  );
}
export function AIDiagnostics() {
  useGame((s) => s.revision);
  const enabled = usePhysicsDebug((s) => s.enabled && s.aiLines);
  return enabled && race.mode === 'gp' ? <Lines key={race.runId} /> : null;
}
