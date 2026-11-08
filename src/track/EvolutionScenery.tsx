import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { Instances } from './InstancedProps';
import { WindMaterial } from './WindMaterial';
import {
  poseAt,
  terrainHeight,
  nearestTrack,
  roadHeight,
  curve,
  trackFeatures,
  palette,
  ribbon,
  TRACK_LENGTH,
} from './PineValley';
const box = new THREE.BoxGeometry(1, 1, 1),
  rock = new THREE.DodecahedronGeometry(1, 0),
  leaf = new THREE.IcosahedronGeometry(1, 0),
  cone = new THREE.ConeGeometry(1, 1, 7),
  blade = new THREE.ConeGeometry(1, 1, 3),
  tire = new THREE.TorusGeometry(0.65, 0.21, 5, 10);
type Item = { position: THREE.Vector3; scale: THREE.Vector3; rotation?: number };
let seed = 2031;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
function at(t: number, lateral: number) {
  const p = poseAt(t).p,
    d = curve.getTangentAt(t);
  p.x -= d.z * lateral;
  p.z += d.x * lateral;
  p.y = terrainHeight(p.x, p.z);
  return p;
}
const bushes: Item[] = [],
  grasses: Item[] = [],
  flowers: Item[] = [],
  stones: Item[] = [],
  birchTrunks: Item[] = [],
  birchCrowns: Item[] = [];
for (let i = 0; i < 190; i++) {
  const t = random(),
    side = random() < 0.5 ? -1 : 1,
    offset = side * (12 + random() * 25),
    p = at(t, offset),
    near = nearestTrack(p.x, p.z);
  if (near.distance < 11) continue;
  const scale = 0.7 + random();
  if (i < 36) {
    birchTrunks.push({
      position: p.clone().add(new THREE.Vector3(0, 1.8, 0)),
      scale: new THREE.Vector3(0.3, 3.6, 0.3),
    });
    birchCrowns.push({
      position: p.clone().add(new THREE.Vector3(0, 4, 0)),
      scale: new THREE.Vector3(2 * scale, 2.7 * scale, 1.8 * scale),
      rotation: t * 20,
    });
  } else if (i < 100)
    bushes.push({
      position: p.clone().add(new THREE.Vector3(0, 0.65, 0)),
      scale: new THREE.Vector3(scale * 1.7, scale, scale * 1.3),
    });
  else
    stones.push({
      position: p.clone().add(new THREE.Vector3(0, 0.25, 0)),
      scale: new THREE.Vector3(scale, 0.55 * scale, 0.8 * scale),
      rotation: t * 30,
    });
  for (let j = 0; j < 3; j++) {
    const q = p.clone().add(new THREE.Vector3(random() * 3, 0, random() * 3));
    q.y = terrainHeight(q.x, q.z) + 0.3;
    grasses.push({
      position: q,
      scale: new THREE.Vector3(0.25, 0.65, 0.25),
      rotation: random() * 6,
    });
    if (i % 5 === 0)
      flowers.push({
        position: q.clone().add(new THREE.Vector3(0, 0.2, 0)),
        scale: new THREE.Vector3(0.2, 0.14, 0.2),
      });
  }
}
const edgeLeft = ribbon(-5.64, -5.54, 0.047),
  edgeRight = ribbon(5.54, 5.64, 0.047);
const jumpPaint = (() => {
  const positions: number[] = [],
    indices: number[] = [],
    shape = [
      [-1.35, 0],
      [-1.1, -0.55],
      [0, 0.45],
      [1.1, -0.55],
      [1.35, 0],
      [0, 1.05],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
    triangles = THREE.ShapeUtils.triangulateShape(shape, []);
  for (let i = 0; i < 5; i++) {
    const base = i * shape.length;
    for (const v of shape) {
      const t = trackFeatures.jump.approach + 0.002 + i * 0.004 + v.y / TRACK_LENGTH,
        w = trackFeatures.jump.laneCenter + v.x,
        p = curve.getPointAt(t),
        d = curve.getTangentAt(t);
      positions.push(p.x - d.z * w, roadHeight(t, w) + 0.025, p.z + d.x * w);
    }
    for (const tri of triangles) indices.push(...tri.map((j) => j + base));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
})();
export function TrackLabel({
  text,
  position,
  width = 4,
  height = 1,
  rotation = 0,
}: {
  text: string;
  position: [number, number, number];
  width?: number;
  height?: number;
  rotation?: number;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#173d39';
    ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = '#ffe2a0';
    ctx.font = '900 90px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, 133, 960);
    return new THREE.CanvasTexture(canvas);
  }, [text]);
  const signGeometry = useMemo(() => {
    const front = new THREE.PlaneGeometry(width, height),
      back = new THREE.PlaneGeometry(width, height);
    back.rotateY(Math.PI);
    back.translate(0, 0, -0.015);
    const g = mergeGeometries([front, back]);
    front.dispose();
    back.dispose();
    return g;
  }, [width, height]);
  useEffect(
    () => () => {
      texture.dispose();
    },
    [texture],
  );
  useEffect(() => () => signGeometry.dispose(), [signGeometry]);
  return (
    <mesh position={position} rotation={[0, rotation, 0]} geometry={signGeometry}>
      <meshBasicMaterial map={texture} side={THREE.FrontSide} />
    </mesh>
  );
}
function Landmark({ t, side, title }: { t: number; side: number; title: string }) {
  const p = at(t, side),
    pose = poseAt(t);
  return (
    <group position={p} rotation={[0, pose.yaw, 0]}>
      {title === 'SPLIT ROCK' ? (
        <>
          {[-1, 1].map((s) => (
            <mesh
              key={s}
              position={[s * 2.3, 4 + s * 0.7, 0]}
              rotation={[0.15, s * 0.3, s * 0.12]}
              scale={[2.5, 7 + s, 3]}
              castShadow
              geometry={rock}
            >
              <meshStandardMaterial color={s === 1 ? '#c4bba0' : '#8d9d91'} flatShading />
            </mesh>
          ))}
          <mesh position={[0, 1, -4]} scale={[7, 2, 4]} geometry={rock}>
            <meshStandardMaterial color="#a4b49d" flatShading />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[0, 1, 0]} castShadow>
            <boxGeometry args={[13, 0.5, 7]} />
            <meshStandardMaterial color="#b8996c" />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 6, 2, 0]}>
              <boxGeometry args={[0.18, 2, 7]} />
              <meshStandardMaterial color="#efe1b4" />
            </mesh>
          ))}
          {Array.from({ length: 7 }, (_, i) => (
            <group key={i} position={[-4 + i * 1.3, 1.3, (i % 2) * 2 - 1]}>
              <mesh position={[0, 0.6, 0]}>
                <boxGeometry args={[0.45, 1.1, 0.4]} />
                <meshStandardMaterial color={i % 2 ? palette.coral : '#567b83'} />
              </mesh>
              <mesh position={[0, 1.4, 0]}>
                <icosahedronGeometry args={[0.3, 0]} />
                <meshStandardMaterial color="#e6c49e" />
              </mesh>
            </group>
          ))}
        </>
      )}
      <TrackLabel text={title} position={[0, 3, -5]} width={7} height={1.2} />
    </group>
  );
}
export function EvolutionScenery() {
  const j = trackFeatures.jump,
    approach = poseAt(j.approach - 0.012),
    crest = poseAt(j.crest);
  const cones = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const p = at(0.98 + i * 0.0011, -10);
        return {
          position: p.add(new THREE.Vector3(0, 0.45, 0)),
          scale: new THREE.Vector3(0.35, 0.9, 0.35),
        };
      }),
    [],
  );
  return (
    <>
      <mesh geometry={edgeLeft}>
        <meshStandardMaterial color="#b9c5bc" roughness={1} />
      </mesh>
      <mesh geometry={edgeRight}>
        <meshStandardMaterial color="#b9c5bc" roughness={1} />
      </mesh>
      <mesh geometry={jumpPaint}>
        <meshStandardMaterial color={palette.cream} side={THREE.DoubleSide} roughness={1} />
      </mesh>
      <Instances items={birchTrunks} geometry={box} color="#d8d2ac" />
      <Instances items={birchCrowns} geometry={leaf} color="#92bd77" wind />
      <Instances items={bushes} geometry={leaf} color="#449b78" wind />
      <Instances items={grasses} geometry={blade} color="#8ac492" shadow={false} wind />
      <Instances items={flowers} geometry={leaf} color="#ffe2a0" shadow={false} />
      <Instances items={stones} geometry={rock} color="#99aa9a" />
      <Instances items={cones} geometry={cone} color={palette.coral} />
      <Landmark t={trackFeatures.landmarks[0].t} side={-23} title="SPLIT ROCK" />
      <Landmark t={trackFeatures.landmarks[2].t} side={22} title="SUMMIT VIEW" />
      <group position={[approach.p.x, approach.p.y, approach.p.z]} rotation={[0, approach.yaw, 0]}>
        <TrackLabel text="PINE LEAP   ↗" position={[-3, 3.4, -0.2]} width={5} height={1.1} />
        <TrackLabel text="RIGHT LINE / LEVEL" position={[4, 2.3, -0.2]} width={3.3} height={0.7} />
        {[-7.9, 7.9].map((x) => (
          <mesh key={x} position={[x, 2, 0]}>
            <boxGeometry args={[0.15, 4, 0.15]} />
            <meshStandardMaterial color="#fff2c7" />
          </mesh>
        ))}
      </group>
      {[-1, 1].map((side) => {
        const p = at(j.crest, side * 9);
        return (
          <group key={side} position={p} rotation={[0, crest.yaw, 0]}>
            <mesh position={[0, 3.5, 0]}>
              <boxGeometry args={[0.12, 7, 0.12]} />
              <meshStandardMaterial color="#fff2c7" />
            </mesh>
            <mesh position={[0, 5.5, 0]}>
              <planeGeometry args={[1.4, 2.6, 8, 8]} />
              <WindMaterial color={palette.coral} flag />
            </mesh>
            <TrackLabel text="APEX" position={[0, 5.5, 0.05]} width={1.25} height={0.65} />
          </group>
        );
      })}
      {[0.1, 0.2, 0.34, 0.39, 0.48, 0.68, 0.79, 0.87].map((t, i) => {
        const p = at(t, (i % 2 ? -1 : 1) * 9.5),
          pose = poseAt(t);
        return (
          <group key={t} position={p} rotation={[0, pose.yaw, 0]}>
            <mesh position={[0, 1.1, 0]}>
              <boxGeometry args={[0.13, 2.2, 0.13]} />
              <meshStandardMaterial color="#ebdfb5" />
            </mesh>
            <TrackLabel
              text={i % 2 ? '‹ ‹ ‹' : '› › ›'}
              position={[0, 2.25, 0]}
              width={2.5}
              height={1}
            />
          </group>
        );
      })}
      {[0.25, 0.47, 0.69, 0.91].map((t) => {
        const p = at(t, 12);
        return (
          <group key={t} position={p} rotation={[0, poseAt(t).yaw, 0]}>
            <mesh position={[0, 1, 0]}>
              <boxGeometry args={[3, 2, 2.5]} />
              <meshStandardMaterial color="#e4e6c8" />
            </mesh>
            <mesh position={[0, 2.2, 0]}>
              <boxGeometry args={[3.6, 0.35, 3.2]} />
              <meshStandardMaterial color={palette.coral} />
            </mesh>
          </group>
        );
      })}
      <group position={at(0.982, -18)} rotation={[0, poseAt(0.982).yaw, 0]}>
        <TrackLabel text="APEX / SERVICE" position={[0, 2.2, 0]} width={5} height={1} />
        {Array.from({ length: 8 }, (_, i) => (
          <mesh
            key={i}
            geometry={tire}
            position={[(i % 4) * 1.3 - 2, Math.floor(i / 4) * 0.45 + 0.4, 2]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <meshStandardMaterial color="#2d3c40" />
          </mesh>
        ))}
        <mesh position={[4, 1.4, 2]}>
          <boxGeometry args={[1.5, 2.8, 1.5]} />
          <meshStandardMaterial color="#3c7170" />
        </mesh>
      </group>
    </>
  );
}
