import * as THREE from 'three';
import type { TrackDefinition } from './ActiveTrack';
/** A closed swept section shares endpoints and samples the banked road height at each edge. */
export function continuousRail(
  track: Pick<TrackDefinition, 'samples' | 'roadHeight'> & {
    edgePoint?: (t: number, w: number) => THREE.Vector3;
  },
  offset = 7.6,
  width = 0.3,
  height = 0.22,
  elevation = 0.95,
  exclude: (t: number) => boolean = () => false,
) {
  const pos: number[] = [],
    indices: number[] = [],
    n = track.samples.length;
  for (const side of [-1, 1]) {
    const base = pos.length / 3;
    for (const sample of track.samples) {
      for (const [dw, dy] of [
        [-width / 2, -height / 2],
        [width / 2, -height / 2],
        [width / 2, height / 2],
        [-width / 2, height / 2],
      ]) {
        const w = side * offset + dw,
          p = track.edgePoint?.(sample.t, w) ?? sample.p.clone().addScaledVector(sample.side, w);
        pos.push(p.x, track.roadHeight(sample.t, w) + elevation + dy, p.z);
      }
    }
    for (let i = 0; i < n; i++) {
      if (exclude(track.samples[i].t) || exclude(track.samples[(i + 1) % n].t)) continue;
      for (let j = 0; j < 4; j++) {
        const a = base + i * 4 + j,
          b = base + ((i + 1) % n) * 4 + j,
          c = base + i * 4 + ((j + 1) % 4),
          d = base + ((i + 1) % n) * 4 + ((j + 1) % 4);
        indices.push(a, b, c, c, b, d);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
export function forestTerrainTint(source: THREE.BufferGeometry) {
  const g = source.clone(),
    p = g.getAttribute('position'),
    n = g.getAttribute('normal'),
    colors = [];
  const moss = new THREE.Color('#5e8e60'),
    earth = new THREE.Color('#8e9963');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i),
      mix = 0.5 + 0.23 * Math.sin(x * 0.053 + Math.cos(z * 0.035) * 2) + 0.2 * Math.sin(z * 0.078);
    const c = moss
      .clone()
      .lerp(earth, Math.max(0, Math.min(0.75, mix * (1 - (n?.getY(i) ?? 1) * 0.35))));
    c.multiplyScalar(0.92 + 0.08 * Math.sin(x * 0.11 + z * 0.08));
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
}
/** Continuous deck follows both banked edges; long level boxes can cut through the asphalt. */
export function bridgeDeck(
  track: Pick<TrackDefinition, 'samples' | 'roadHeight'> & {
    edgePoint?: (t: number, w: number) => THREE.Vector3;
  },
  include: (t: number) => boolean,
) {
  const positions: number[] = [],
    indices: number[] = [],
    n = track.samples.length;
  for (const sample of track.samples)
    for (const [w, dy] of [
      [-7.1, -1],
      [7.1, -1],
      [7.1, -0.2],
      [-7.1, -0.2],
    ]) {
      const p = track.edgePoint?.(sample.t, w) ?? sample.p.clone().addScaledVector(sample.side, w);
      positions.push(p.x, track.roadHeight(sample.t, w) + dy, p.z);
    }
  for (let i = 0; i < n; i++) {
    if (!include(track.samples[i].t)) continue;
    for (let j = 0; j < 4; j++) {
      const a = i * 4 + j,
        b = ((i + 1) % n) * 4 + j,
        c = i * 4 + ((j + 1) % 4),
        d = ((i + 1) % n) * 4 + ((j + 1) % 4);
      indices.push(a, b, c, c, b, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
/** Opaque inward-facing decorative rock; the verified collider is a separate unchanged mesh. */
export function cavernStone(track: {
  tunnels: { start: number; end: number; height: number }[];
  TRACK_LENGTH: number;
  poseAt: (t: number) => { p: THREE.Vector3 };
  curve: THREE.Curve<THREE.Vector3>;
}) {
  const positions: number[] = [],
    indices: number[] = [],
    colors: number[] = [];
  for (const [index, tunnel] of track.tunnels.entries()) {
    const count = Math.ceil(((tunnel.end - tunnel.start) * track.TRACK_LENGTH) / 3),
      base = positions.length / 3;
    for (let i = 0; i <= count; i++) {
      const t = tunnel.start + ((tunnel.end - tunnel.start) * i) / count,
        p = track.poseAt(t).p,
        d = track.curve.getTangentAt(t);
      for (let j = 0; j <= 12; j++) {
        const a = (j * Math.PI) / 12,
          rough = 0.09 * Math.sin(i * 2.3 + j * 3.1),
          w = Math.cos(a) * (7.58 + rough);
        positions.push(
          p.x - d.z * w,
          p.y + Math.sin(a) * (tunnel.height + 0.18 + rough),
          p.z + d.x * w,
        );
      }
      if (i < count)
        for (let j = 0; j < 12; j++) {
          const a = base + i * 13 + j,
            b = a + 13;
          indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
    }
    const shade = new THREE.Color(index ? '#968772' : '#536c6a');
    for (let i = 0; i < (count + 1) * 13; i++) {
      const c = shade
        .clone()
        .multiplyScalar(0.74 + 0.26 * (0.5 + 0.5 * Math.sin(i * 1.37 + Math.floor(i / 13) * 0.8)));
      colors.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  const flat = g.toNonIndexed();
  g.dispose();
  flat.computeVertexNormals();
  return flat;
}
