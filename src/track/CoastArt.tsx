import { useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import * as coast from './CoralCoast';
import { Instances } from './InstancedProps';
import { TrackLabel } from './EvolutionScenery';
import {
  landGeometry,
  landSection,
  landHeight,
  coastPoint,
  shoreTexture,
  frondGeometry,
  trunkGeometry,
} from './CoastLandscape';
import { useGame } from '../game/store';
const box = new THREE.BoxGeometry(),
  rock = new THREE.DodecahedronGeometry(1, 0),
  cone = new THREE.ConeGeometry(1, 1, 6),
  leaf = frondGeometry(),
  trunk = trunkGeometry(),
  land = landGeometry(),
  shore = shoreTexture();
type Item = { position: THREE.Vector3; scale: THREE.Vector3; rotation?: number };
const trunks: Item[] = [],
  fronds: Item[] = [],
  bushes: Item[] = [],
  ferns: Item[] = [],
  flowers: Item[] = [],
  grasses: Item[] = [],
  treeCrowns: Item[] = [],
  treeTrunks: Item[] = [];
let seed = 5101;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
const forbidden = (t: number) =>
  !!coast.tunnelAt(t, 0.012) ||
  (t > coast.trackFeatures.jump.approach - 0.025 && t < coast.trackFeatures.jump.end + 0.02);
for (let cluster = 0; cluster < 125; cluster++) {
  const jungle = cluster < 68,
    center = jungle ? 0.65 + random() * 0.175 : 0.035 + random() * 0.455;
  if (forbidden(center)) continue;
  for (let j = 0; j < (jungle ? 5 : 3); j++) {
    const t = center + (random() - 0.5) * 0.006,
      w = (cluster % 2 ? 1 : -1) * (16 + random() * 23),
      p = coastPoint(t, w),
      near = coast.nearestTrack(p.x, p.z);
    if (near.distance < 13) continue;
    const h = (cluster % 3 === 0 ? 5 : cluster % 3 === 1 ? 8 : 11) * (1 + random() * 0.15);
    if (j < 2) {
      trunks.push({ position: p, scale: new THREE.Vector3(0.85, h, 0.85) });
      for (let k = 0; k < 7; k++)
        fronds.push({
          position: p.clone().add(new THREE.Vector3(0.47, h, 0)),
          scale: new THREE.Vector3(1 + (h - 5) * 0.04, 1, 1 + (h - 5) * 0.09),
          rotation: (k * Math.PI * 2) / 7 + cluster,
        });
    } else if (j === 2) {
      treeTrunks.push({
        position: p.clone().add(new THREE.Vector3(0, 1.7, 0)),
        scale: new THREE.Vector3(0.35, 3.4, 0.35),
      });
      treeCrowns.push({
        position: p.clone().add(new THREE.Vector3(0, 4, 0)),
        scale: new THREE.Vector3(2.4, 2.7, 2.3),
        rotation: cluster,
      });
    }
    bushes.push({
      position: p.clone().add(new THREE.Vector3(3, 0.65, 2)),
      scale: new THREE.Vector3(1.6, 0.9, 1.4),
      rotation: cluster,
    });
    for (let k = 0; k < 5; k++)
      ferns.push({
        position: p.clone().add(new THREE.Vector3(-2, 0.2, 1)),
        scale: new THREE.Vector3(0.5, 0.45, 0.5),
        rotation: k * 1.257 + cluster,
      });
    if (j % 2 === 0)
      flowers.push({
        position: p.clone().add(new THREE.Vector3(3, 1.3, 2)),
        scale: new THREE.Vector3(0.7, 0.35, 0.7),
      });
    for (let k = 0; k < 3; k++)
      grasses.push({
        position: p.clone().add(new THREE.Vector3(k, 0.35, -2)),
        scale: new THREE.Vector3(0.25, 0.7, 0.25),
        rotation: k,
      });
  }
}
const lagoonRocks: Item[] = [];
for (const [t, w] of [
  [coast.trackFeatures.jump.crest - 0.002, -30],
  [coast.trackFeatures.jump.crest + 0.01, -30],
  [coast.trackFeatures.jump.end + 0.006, 30],
]) {
  const p = coastPoint(t, w);
  p.y = -2.5;
  lagoonRocks.push({
    position: p.clone(),
    scale: new THREE.Vector3(13, 3.8, 10),
    rotation: coast.poseAt(t).yaw,
  });
  const base = p.clone().setY(0.6);
  trunks.push({ position: base, scale: new THREE.Vector3(0.8, 8, 0.8) });
  for (let j = 0; j < 7; j++)
    fronds.push({
      position: base.clone().add(new THREE.Vector3(0.44, 8, 0)),
      scale: new THREE.Vector3(1, 1, 1.15),
      rotation: (j * Math.PI * 2) / 7,
    });
}
for (const w of [-30, -47]) {
  const p = coastPoint(coast.trackFeatures.jump.crest + 0.008, w).setY(4);
  lagoonRocks.push({
    position: p,
    scale: new THREE.Vector3(3.5, 9, 4),
    rotation: coast.poseAt(coast.trackFeatures.jump.crest).yaw,
  });
}
lagoonRocks.push({
  position: coastPoint(coast.trackFeatures.jump.crest + 0.008, -38.5).setY(13),
  scale: new THREE.Vector3(12, 2.8, 4),
  rotation: coast.poseAt(coast.trackFeatures.jump.crest + 0.008).yaw,
});
const split = <T,>(items: T[], index: number) => items.filter((_, i) => i % 2 === index);
const foliage = [split(fronds, 0), split(fronds, 1)],
  greenery = [split(bushes, 0), split(bushes, 1)];
const mountains = Array.from({ length: 9 }, (_, i) => ({
  position: new THREE.Vector3(-320 + i * 170, -22, -900 - Math.sin(i) * 60),
  scale: new THREE.Vector3(100, 70 + (i % 3) * 25, 80),
  rotation: i,
}));
const buildings = Array.from({ length: 18 }, (_, i) => {
  const t = 0.002 + i * 0.0031,
    w = (i % 2 ? 1 : -1) * (24 + (i % 3) * 3),
    p = coastPoint(t, w),
    h = 8 + (i % 4);
  return {
    position: p.add(new THREE.Vector3(0, h / 2, 0)),
    scale: new THREE.Vector3(7, h, 7),
    rotation: coast.poseAt(t).yaw,
  };
});
const houses = [
  buildings.filter((_, i) => i % 3 === 0),
  buildings.filter((_, i) => i % 3 === 1),
  buildings.filter((_, i) => i % 3 === 2),
];
const roofs = buildings.map((p) => ({
  ...p,
  position: p.position.clone().add(new THREE.Vector3(0, p.scale.y / 2 + 0.2, 0)),
  scale: new THREE.Vector3(8, 0.4, 8),
}));
const peakedRoofs = buildings
  .filter((_, i) => i % 4 === 0)
  .map((p) => ({
    ...p,
    position: p.position.clone().add(new THREE.Vector3(0, p.scale.y / 2 + 0.8, 0)),
    scale: new THREE.Vector3(5, 1.6, 5),
  }));
const windows = buildings.flatMap((p) =>
  [-1, 1].flatMap((side) =>
    [-1.6, 1.6].map((z) => {
      const q = new THREE.Vector3(side * 3.53, 0.25, z).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        p.rotation,
      );
      return {
        position: p.position.clone().add(q),
        scale: new THREE.Vector3(0.06, 1.3, 1.1),
        rotation: p.rotation,
      };
    }),
  ),
);
const balconies = buildings
  .filter((_, i) => i % 3 === 0)
  .map((p) => ({
    ...p,
    position: p.position.clone().add(new THREE.Vector3(0, 0.4, 4)),
    scale: new THREE.Vector3(5, 0.2, 2),
  }));
const piers = Array.from({ length: 7 }, (_, i) => ({
  position: coastPoint(0.012 + i * 0.006, 45).setY(0.3),
  scale: new THREE.Vector3(18, 0.5, 3),
  rotation: coast.poseAt(0.012 + i * 0.006).yaw,
}));
const boats = piers.map((p) => ({
  position: p.position.clone().add(new THREE.Vector3(1, -0.3, 5)),
  scale: new THREE.Vector3(4, 0.8, 1.5),
  rotation: p.rotation,
}));
const masts = boats.map((p) => ({
  ...p,
  position: p.position.clone().add(new THREE.Vector3(0, 2.3, 0)),
  scale: new THREE.Vector3(0.1, 4.6, 0.1),
}));
const sails = boats.map((p) => ({
  ...p,
  position: p.position.clone().add(new THREE.Vector3(0.8, 2.7, 0)),
  scale: new THREE.Vector3(2.1, 2.7, 0.12),
}));
const umbrellas = Array.from({ length: 16 }, (_, i) => {
  const p = coastPoint(0.006 + i * 0.0028, -18);
  return {
    position: p.add(new THREE.Vector3(0, 3, 0)),
    scale: new THREE.Vector3(2.5, 0.9, 2.5),
    rotation: i,
  };
});
const marketCounters = umbrellas
  .filter((_, i) => i % 4 === 0)
  .map((p) => ({
    ...p,
    position: p.position.clone().add(new THREE.Vector3(0, -2.4, 0)),
    scale: new THREE.Vector3(2.4, 1.2, 1.4),
  }));
const umbrellaPoles = umbrellas.map((p) => ({
  ...p,
  position: p.position.clone().add(new THREE.Vector3(0, -1.5, 0)),
  scale: new THREE.Vector3(0.1, 3, 0.1),
}));
const flags = Array.from({ length: 24 }, (_, i) => {
  const t = ((i % 12) * 5 - 35) / coast.TRACK_LENGTH,
    p = coastPoint((t + 1) % 1, i < 12 ? -11 : 11);
  return {
    position: p.add(new THREE.Vector3(0, 4, 0)),
    scale: new THREE.Vector3(1.7, 1.1, 0.06),
    rotation: coast.poseAt(t).yaw,
  };
});
const poles = flags.map((p) => ({
  ...p,
  position: p.position.clone().add(new THREE.Vector3(0, -2, 0)),
  scale: new THREE.Vector3(0.1, 4, 0.1),
}));
const bridgePiers = coast.samples
  .filter((s, i) => !landSection(s.t) && i % 24 === 0)
  .flatMap((s) =>
    [-1, 1].map((side) => ({
      position: s.p
        .clone()
        .addScaledVector(s.side, side * 5.7)
        .setY((coast.roadHeight(s.t) - 2) / 2),
      scale: new THREE.Vector3(1.3, coast.roadHeight(s.t) + 2, 1.8),
      rotation: Math.atan2(s.tangent.x, s.tangent.z),
    })),
  );
const bridgeCaps = coast.samples
  .filter((s, i) => !landSection(s.t) && i % 24 === 0)
  .map((s) => ({
    position: s.p.clone().setY(coast.roadHeight(s.t) - 0.9),
    scale: new THREE.Vector3(14, 0.8, 2),
    rotation: Math.atan2(s.tangent.x, s.tangent.z),
  }));
export function CoastalWater() {
  const time = useMemo(() => ({ value: 0 }), []),
    material = useMemo(() => {
      const m = new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.42, metalness: 0.13 });
      m.onBeforeCompile = (shader) => {
        shader.uniforms.coastTime = time;
        shader.uniforms.coastShore = { value: shore };
        shader.vertexShader = 'varying vec2 coastWorld;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <worldpos_vertex>',
          '#include <worldpos_vertex>\ncoastWorld=(modelMatrix*vec4(transformed,1.0)).xz;',
        );
        shader.fragmentShader =
          'varying vec2 coastWorld; uniform float coastTime; uniform sampler2D coastShore;\n' +
          shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
 vec2 islandUV=(coastWorld-vec2(-400.0,-900.0))/1500.0;
 vec2 depth=texture2D(coastShore,islandUV).rg;
 float ripple=sin(coastWorld.x*.16+coastWorld.y*.09+coastTime*.7)*sin(coastWorld.y*.23-coastTime*.5);
 vec3 sea=mix(vec3(.015,.33,.38),vec3(.04,.69,.61),smoothstep(.05,.6,depth.r));
 sea=mix(sea,vec3(.42,.78,.70),smoothstep(.55,.85,depth.r));
 float foam=depth.g*smoothstep(.25,.8,sin(coastWorld.x*.6+coastWorld.y*.3+coastTime*.8)*.5+.5);
 diffuseColor.rgb=mix(sea+vec3(ripple*.012*(1.0-smoothstep(80.0,350.0,distance(cameraPosition.xz,coastWorld)))),vec3(.77,.89,.79),foam*.6);`,
        );
      };
      m.customProgramCacheKey = () => 'coral-water-v07';
      return m;
    }, [time]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ clock }) => {
    time.value = useGame.getState().save.settings.reducedMotion ? 0 : clock.elapsedTime;
  });
  return (
    <mesh
      name="coral-ocean"
      rotation={[-Math.PI / 2, 0, 0]}
      position={[250, -0.8, 0]}
      material={material}
    >
      <planeGeometry args={[3000, 3000]} />
    </mesh>
  );
}
export function CoastArt({ preset = 'high' }: { preset?: string }) {
  const stride = preset === 'low' ? 3 : preset === 'medium' ? 2 : 1;
  const thin = <T,>(items: T[], group = 1) =>
    items.filter((_, i) => Math.floor(i / group) % stride === 0);
  return (
    <group name="coral-art">
      <Instances items={lagoonRocks} geometry={rock} color="#b6b59f" />
      <mesh geometry={land} receiveShadow>
        <meshStandardMaterial vertexColors flatShading roughness={1} />
      </mesh>
      <CoastalWater />
      <Instances items={thin(trunks)} geometry={trunk} color="#94765a" />
      <Instances
        items={fronds.filter((_, i) => Math.floor(i / 7) % stride === 0 && i % 2 === 0)}
        geometry={leaf}
        color="#397d5b"
        wind
        doubleSide
      />
      <Instances
        items={fronds.filter((_, i) => Math.floor(i / 7) % stride === 0 && i % 2 === 1)}
        geometry={leaf}
        color="#63a879"
        wind
        doubleSide
      />
      <Instances items={greenery[0]} geometry={rock} color="#4c8c6b" wind />
      <Instances items={greenery[1]} geometry={rock} color="#74a27b" wind />
      <Instances items={thin(ferns)} geometry={leaf} color="#4b9577" wind doubleSide />
      <Instances items={thin(flowers)} geometry={rock} color="#df9d98" />
      <Instances items={thin(grasses)} geometry={cone} color="#85ab80" wind shadow={false} />
      <Instances items={thin(treeTrunks)} geometry={box} color="#89735b" />
      <Instances items={thin(treeCrowns)} geometry={rock} color="#639578" />
      <Instances items={mountains} geometry={rock} color="#729caa" shadow={false} />
      {houses.map((items, i) => (
        <Instances
          key={i}
          items={items}
          geometry={box}
          color={['#dda892', '#a7cec0', '#e4d3a6'][i]}
        />
      ))}
      <Instances items={roofs} geometry={box} color="#e9d8b1" />
      <Instances items={peakedRoofs} geometry={cone} color="#cc9a81" />
      <Instances items={windows} geometry={box} color="#496c75" />
      <Instances items={balconies} geometry={box} color="#e9d8b1" />
      <Instances items={piers} geometry={box} color="#ab8966" />
      <Instances items={boats} geometry={rock} color="#efe6c9" />
      <Instances items={masts} geometry={box} color="#b2a58b" />
      <Instances items={sails} geometry={cone} color="#f1dfb5" />
      <Instances items={umbrellas} geometry={cone} color="#df957e" />
      <Instances items={umbrellaPoles} geometry={box} color="#eee1bb" />
      <Instances items={marketCounters} geometry={box} color="#eed5a6" />
      <Instances items={poles} geometry={box} color="#e3d5b4" />
      <Instances items={flags} geometry={box} color="#e4bd73" wind />
      <Instances items={bridgePiers} geometry={box} color="#829a91" />
      <Instances items={bridgeCaps} geometry={box} color="#d3c6a9" />
      <group
        position={coastPoint(coast.trackFeatures.jump.approach - 0.009, 15)}
        rotation={[0, coast.poseAt(coast.trackFeatures.jump.approach - 0.009).yaw, 0]}
      >
        <TrackLabel
          text="LAGOON LEAP / LEFT 80+   |   RIGHT BYPASS"
          position={[0, 3, 0]}
          width={9}
          height={1}
        />
        <mesh position={[0, 1.5, 0]}>
          <boxGeometry args={[0.18, 3, 0.18]} />
          <meshStandardMaterial color="#eee0bb" />
        </mesh>
      </group>
      <mesh position={[330, 22, 440]}>
        <coneGeometry args={[95, 95, 9]} />
        <meshStandardMaterial color="#7f9c9f" flatShading />
      </mesh>
      <group position={coastPoint(0.715, 33)}>
        <mesh position={[0, -3, 0]} scale={[9, 10, 7]} geometry={rock}>
          <meshStandardMaterial color="#97a89b" flatShading />
        </mesh>
        <mesh position={[0, -3, 7.05]}>
          <boxGeometry args={[4, 15, 0.12]} />
          <meshBasicMaterial color="#baded2" transparent opacity={0.78} />
        </mesh>
        <mesh position={[0, -10, 5]} scale={[9, 0.4, 6]} geometry={rock}>
          <meshBasicMaterial color="#d5e8d8" />
        </mesh>
      </group>
    </group>
  );
}
