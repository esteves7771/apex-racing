import { it, expect } from 'vitest';
import * as THREE from 'three';
import * as canyon from '../track/CanyonCarnival';
import { createCanyonTerrain } from '../track/CanyonTerrain';
import { canyonTunnelGeometry } from '../track/CanyonStructures';

it('builds a dimensional terrain field below each authoritative road footprint', () => {
  const field = createCanyonTerrain(canyon),
    positions = field.geometry.getAttribute('position');
  let low = Infinity,
    high = -Infinity;
  for (let i = 0; i < positions.count; i++) {
    low = Math.min(low, positions.getY(i));
    high = Math.max(high, positions.getY(i));
    expect(Number.isFinite(positions.getY(i))).toBe(true);
  }
  expect(high - low).toBeGreaterThan(60);
  for (const route of [{ id: 'main', start: -0.01, end: 1.02 }, ...canyon.branches]) {
    for (let i = 0; i <= 250; i++) {
      const t = THREE.MathUtils.lerp(route.start, route.end, i / 250);
      for (const side of [-0.45, 0, 0.45]) {
        const p = canyon.routePose(t, route.id, side * canyon.roadWidthAt(t, route.id)).p;
        expect(field.heightAt(p.x, p.z)).toBeLessThan(p.y - 0.1);
      }
    }
  }
  const n = field.geometry.getAttribute('normal');
  for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBeGreaterThan(0);
  field.geometry.dispose();
});

it('builds real tunnel volumes with a clear roadway and sufficient roof height', () => {
  const geometry = canyonTunnelGeometry(canyon);
  expect(geometry.index!.count).toBeGreaterThan(1000);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  for (const tunnel of canyon.tunnels) {
    const p = canyon.routePose((tunnel.start + tunnel.end) / 2, tunnel.route).p;
    ray.set(p.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(0, 1, 0));
    const hit = ray.intersectObject(mesh)[0];
    expect(hit).toBeDefined();
    expect(hit.distance).toBeGreaterThan(6.5);
    expect(hit.distance).toBeLessThan(9);
  }
  geometry.dispose();
  (mesh.material as THREE.Material).dispose();
});
