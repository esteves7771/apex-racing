import * as THREE from 'three';

export interface CanyonTerrainSource {
  routePose(t: number, route?: string, lateral?: number): { p: THREE.Vector3; yaw: number };
  roadWidthAt(t: number, route?: string): number;
  projectRoute(
    x: number,
    z: number,
    previousT?: number,
    route?: string,
  ): { t: number; lateral: number; distance: number };
  branches: { id: string; start: number; end: number }[];
}
type Anchor = { p: THREE.Vector3; t: number; route: string };

/** A cached heightfield, shared by rendering, contact geometry and off-road height queries. */
export function createCanyonTerrain(source: CanyonTerrainSource, spacing = 12) {
  const anchors: Anchor[] = [],
    bins = new Map<string, Anchor[]>(),
    cell = 90;
  const routes = [{ id: 'main', start: -0.014, end: 1.05 }, ...source.branches];
  for (const route of routes) {
    const count = Math.ceil((route.end - route.start) * 550);
    for (let i = 0; i <= count; i++) {
      const t = THREE.MathUtils.lerp(route.start, route.end, i / count);
      const anchor = { p: source.routePose(t, route.id).p, t, route: route.id };
      anchors.push(anchor);
      const key = `${Math.floor(anchor.p.x / cell)},${Math.floor(anchor.p.z / cell)}`;
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key)!.push(anchor);
    }
  }
  const minX = Math.floor((Math.min(...anchors.map((a) => a.p.x)) - 220) / spacing) * spacing;
  const minZ = Math.floor((Math.min(...anchors.map((a) => a.p.z)) - 220) / spacing) * spacing;
  const width = Math.ceil((Math.max(...anchors.map((a) => a.p.x)) + 220 - minX) / spacing);
  const depth = Math.ceil((Math.max(...anchors.map((a) => a.p.z)) + 220 - minZ) / spacing);
  const heights = new Float32Array((width + 1) * (depth + 1)),
    biomes = new Float32Array(heights.length),
    distances = new Float32Array(heights.length);
  const nearest = (x: number, z: number) => {
    const bx = Math.floor(x / cell),
      bz = Math.floor(z / cell);
    let best: Anchor | undefined,
      distance = Infinity;
    for (const radius of [1, 3, 6]) {
      for (let dx = -radius; dx <= radius; dx++)
        for (let dz = -radius; dz <= radius; dz++) {
          for (const a of bins.get(`${bx + dx},${bz + dz}`) ?? []) {
            const d = (a.p.x - x) ** 2 + (a.p.z - z) ** 2;
            if (d < distance) {
              best = a;
              distance = d;
            }
          }
        }
      if (best) break;
    }
    if (!best)
      for (const a of anchors) {
        const d = (a.p.x - x) ** 2 + (a.p.z - z) ** 2;
        if (d < distance) {
          best = a;
          distance = d;
        }
      }
    return { anchor: best!, distance: Math.sqrt(distance) };
  };
  const smooth = THREE.MathUtils.smoothstep;
  for (let iz = 0; iz <= depth; iz++)
    for (let ix = 0; ix <= width; ix++) {
      const x = minX + ix * spacing,
        z = minZ + iz * spacing,
        n = nearest(x, z),
        a = n.anchor;
      const projected = n.distance < 85 ? source.projectRoute(x, z, a.t, a.route) : undefined;
      const t = projected?.t ?? a.t,
        d = projected?.distance ?? n.distance;
      const p = projected ? source.routePose(t, a.route, projected.lateral).p : a.p;
      biomes[iz * (width + 1) + ix] = t;
      distances[iz * (width + 1) + ix] = d;
      const half = source.roadWidthAt(t, a.route) / 2;
      // The oasis basin and Skybridge are true valleys below the elevated road, not painted scenery.
      const basin = smooth(t, 0.435, 0.465) * (1 - smooth(t, 0.55, 0.575));
      const sky = smooth(t, 0.585, 0.61) * (1 - smooth(t, 0.695, 0.725));
      const drop = Math.max(basin * 24, sky * 38);
      const shoulder = p.y - 0.65 - drop;
      const shelves = 17 + 11 * Math.sin(x * 0.013 + Math.sin(z * 0.009)) + 9 * Math.cos(z * 0.017);
      const cliff = a.p.y + shelves + 16 * smooth(d, 65, 160);
      heights[iz * (width + 1) + ix] = THREE.MathUtils.lerp(
        shoulder,
        cliff,
        smooth(d, half + 14, half + 66),
      );
    }
  // Conservative cuttings: terrain triangles never poke through a road edge on uphill switchbacks.
  for (const route of routes) {
    const count = Math.ceil((route.end - route.start) * 2400);
    for (let i = 0; i <= count; i++) {
      const t = THREE.MathUtils.lerp(route.start, route.end, i / count),
        half = source.roadWidthAt(t, route.id) / 2;
      for (const lateral of [-half - 1, -half / 2, 0, half / 2, half + 1]) {
        const p = source.routePose(t, route.id, lateral).p;
        const ix = Math.floor((p.x - minX) / spacing),
          iz = Math.floor((p.z - minZ) / spacing);
        for (const dx of [0, 1])
          for (const dz of [0, 1]) {
            const index = (iz + dz) * (width + 1) + ix + dx;
            heights[index] = Math.min(heights[index], p.y - 0.45);
          }
      }
    }
  }
  const positions = new Float32Array(heights.length * 3),
    colors = new Float32Array(positions.length),
    indices: number[] = [];
  const palette = ['#9c5944', '#ba7653', '#cc9062', '#d6aa73'].map((c) => new THREE.Color(c));
  const oasisPalette = ['#64875e', '#7c9c6b', '#9fac78', '#b8bc83'].map((c) => new THREE.Color(c));
  for (let iz = 0; iz <= depth; iz++)
    for (let ix = 0; ix <= width; ix++) {
      const i = iz * (width + 1) + ix,
        y = heights[i],
        c = (
          biomes[i] > 0.435 && biomes[i] < 0.575 && distances[i] < 85 && y < 18
            ? oasisPalette
            : palette
        )[((Math.floor((y + 90) / 8) % 4) + 4) % 4];
      positions.set([minX + ix * spacing, y, minZ + iz * spacing], i * 3);
      colors.set([c.r, c.g, c.b], i * 3);
      if (ix < width && iz < depth) {
        const a = i,
          b = a + width + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const heightAt = (x: number, z: number) => {
    const u = (x - minX) / spacing,
      v = (z - minZ) / spacing,
      ix = Math.floor(u),
      iz = Math.floor(v);
    if (ix < 0 || iz < 0 || ix >= width || iz >= depth) return -28;
    const a = iz * (width + 1) + ix,
      fx = u - ix,
      fz = v - iz;
    const h00 = heights[a],
      h10 = heights[a + 1],
      h01 = heights[a + width + 1],
      h11 = heights[a + width + 2];
    return fx + fz <= 1
      ? h00 + (h10 - h00) * fx + (h01 - h00) * fz
      : h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  };
  return { geometry, heightAt, bounds: { minX, minZ, width, depth, spacing } };
}
