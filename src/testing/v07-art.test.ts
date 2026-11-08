import { it, expect } from 'vitest';
import * as THREE from 'three';
import * as pine from '../track/PineValley';
import * as coast from '../track/CoralCoast';
import { continuousRail, cavernStone, forestTerrainTint, bridgeDeck } from '../track/RoadArt';
import { forestTree, palmTree, rangerCabin } from '../track/ArtAssets';
it('sweeps both visual rail edges through the banked height and closes the last segment', () => {
  const g = continuousRail(coast),
    p = g.getAttribute('position'),
    n = coast.samples.length;
  expect(g.index!.count).toBe(n * 48);
  for (let i = 0; i < n; i += 71)
    expect(p.getY(i * 4)).toBeCloseTo(
      coast.roadHeight(coast.samples[i].t, -7.6 - 0.15) + 0.95 - 0.11,
      4,
    );
  expect([...g.index!.array.slice((n - 1) * 24, n * 24)]).toContain(0);
  g.dispose();
});
it('keeps tunnel wall materials physically opaque through inward-facing stone geometry', () => {
  const g = cavernStone(coast),
    p = g.getAttribute('position'),
    normal = g.getAttribute('normal');
  for (let i = 0; i < p.count; i += 213) {
    const at = new THREE.Vector3().fromBufferAttribute(p, i),
      near = coast.nearestTrack(at.x, at.z),
      center = coast.poseAt(near.t).p,
      dir = center.sub(at);
    expect(new THREE.Vector3().fromBufferAttribute(normal, i).dot(dir)).toBeGreaterThan(0);
  }
  expect(g.getAttribute('color').count).toBe(p.count);
  g.dispose();
});
it('adds forest material variation without changing any terrain vertices or collider input', () => {
  const source = pine.terrainGeometry(),
    snapshot = new Float32Array(source.getAttribute('position').array),
    tinted = forestTerrainTint(source);
  expect(tinted.getAttribute('position').array).toEqual(snapshot);
  expect(source.getAttribute('color')).toBeUndefined();
  expect(tinted.getAttribute('color').count).toBe(source.getAttribute('position').count);
  source.dispose();
  tinted.dispose();
});
it('builds independent reusable meshes with complete finite position/normal/color data', () => {
  for (const factory of [() => forestTree(1), palmTree, rangerCabin]) {
    const a = factory(),
      b = factory();
    expect(a.getAttribute('position').array).not.toBe(b.getAttribute('position').array);
    a.dispose();
    for (const key of ['position', 'normal', 'color']) {
      const data = b.getAttribute(key);
      expect(data.count).toBeGreaterThan(0);
      expect([...data.array].every(Number.isFinite)).toBe(true);
    }
    b.dispose();
  }
});

it('keeps the continuous bridge deck below both asphalt edges through banking and elevation', () => {
  const g = bridgeDeck(coast, () => true),
    p = g.getAttribute('position');
  for (let i = 0; i < coast.samples.length; i += 17) {
    expect(p.getY(i * 4 + 2)).toBeCloseTo(coast.roadHeight(coast.samples[i].t, 7.1) - 0.2, 4);
    expect(p.getY(i * 4 + 3)).toBeCloseTo(coast.roadHeight(coast.samples[i].t, -7.1) - 0.2, 4);
  }
  g.dispose();
});
