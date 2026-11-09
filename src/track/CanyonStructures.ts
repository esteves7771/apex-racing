import * as THREE from 'three';

export interface CanyonStructureSource {
  TRACK_LENGTH: number;
  routePose(t: number, route?: string, lateral?: number): { p: THREE.Vector3; yaw: number };
  roadWidthAt(t: number, route?: string): number;
  projectRoute(x: number, z: number, previousT?: number, route?: string): { distance: number };
  branches: { id: string }[];
  tunnels: { start: number; end: number; route: string; height: number }[];
}

/** Closed rock volumes: the visible inner roof, outer geology and physical collider are one mesh. */
export function canyonTunnelGeometry(source: CanyonStructureSource) {
  const positions: number[] = [],
    indices: number[] = [],
    arc = 12;
  const routes = ['main', ...source.branches.map((b) => b.id)];
  for (const tunnel of source.tunnels) {
    const count = Math.ceil(((tunnel.end - tunnel.start) * source.TRACK_LENGTH) / 6);
    const base = positions.length / 3,
      stride = (arc + 1) * 2;
    const enabled: boolean[] = [];
    for (let i = 0; i <= count; i++) {
      const t = THREE.MathUtils.lerp(tunnel.start, tunnel.end, i / count);
      const half = source.roadWidthAt(t, tunnel.route) / 2 + 1.6;
      for (let ring = 0; ring < 2; ring++)
        for (let j = 0; j <= arc; j++) {
          const a = (j / arc) * Math.PI,
            radius = half + ring * 7;
          const p = source.routePose(t, tunnel.route, Math.cos(a) * radius).p;
          p.y += Math.sin(a) * (tunnel.height + ring * 11);
          if (j === 0 || j === arc) p.y -= 0.9; // Embed both walls into the cutting floor.
          positions.push(p.x, p.y, p.z);
        }
      if (i < count) {
        const middle = THREE.MathUtils.lerp(tunnel.start, tunnel.end, (i + 0.5) / count);
        const p = source.routePose(middle, tunnel.route).p;
        enabled.push(
          routes.every(
            (route) =>
              route === tunnel.route ||
              source.projectRoute(p.x, p.z, middle, route).distance >
                half + 7 + source.roadWidthAt(middle, route) / 2 + 1.5,
          ),
        );
      }
    }
    const quad = (a: number, b: number, c: number, d: number) => indices.push(a, b, c, c, b, d);
    for (let i = 0; i < count; i++) {
      if (!enabled[i]) continue;
      for (let j = 0; j < arc; j++) {
        const a = base + i * stride + j,
          b = a + stride;
        quad(a, a + 1, b, b + 1); // Inner wall normals face the actual road opening.
        const o = a + arc + 1,
          p = o + stride;
        quad(o, p, o + 1, p + 1);
      }
      for (const j of [0, arc]) {
        const a = base + i * stride + j;
        quad(a, a + stride, a + arc + 1, a + stride + arc + 1);
      }
      // Cap only exposed ends, never every longitudinal sample or across the drivable opening.
      for (const end of [0, 1]) {
        if (end === 0 ? i > 0 && enabled[i - 1] : i < count - 1 && enabled[i + 1]) continue;
        for (let j = 0; j < arc; j++) {
          const a = base + (i + end) * stride + j,
            b = a + arc + 1;
          if (end) quad(a, b, a + 1, b + 1);
          else quad(a, a + 1, b, b + 1);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
