import { it, expect } from 'vitest';
import * as c from '../track/CanyonCarnival';
import { Race } from '../game/RaceStateMachine';
import { selectTrack } from '../track/ActiveTrack';
it('provides open five-kilometre road and shared route milestones', () => {
  expect(c.TRACK_LENGTH).toBeGreaterThan(4980);
  expect(c.TRACK_LENGTH).toBeLessThan(5020);
  expect(c.sections).toHaveLength(7);
  expect(c.branches).toHaveLength(4);
  expect(c.poseAt(0).p.distanceTo(c.poseAt(1).p)).toBeGreaterThan(1000);
  for (const b of c.branches) {
    expect(c.routePose(b.start, b.id).p.distanceTo(c.poseAt(b.start).p)).toBeLessThan(0.001);
    expect(c.routePose(b.end, b.id).p.distanceTo(c.poseAt(b.end).p)).toBeLessThan(0.001);
    expect(c.checkpoints.some((cp) => cp.t > b.start && cp.t < b.end)).toBe(false);
  }
});
it('requires every earned sprint milestone and freezes one run rather than laps', () => {
  selectTrack('canyon');
  const r = new Race();
  r.start('time');
  r.tick(3);
  for (let i = 1; i < c.checkpoints.length; i++) {
    r.tick(30);
    r.gate(i);
  }
  expect(r.phase).toBe('FINISHING');
  expect(r.laps).toHaveLength(1);
  expect(r.finishTime).toBe(210);
  r.tick(2);
  r.gate(1);
  expect(r.elapsed).toBe(210);
  selectTrack('pine');
});
it('rejects sprint shortcuts without manufacturing a valid completion', () => {
  selectTrack('canyon');
  const r = new Race();
  r.start('time');
  r.tick(3);
  r.gate(c.checkpoints.length - 1);
  expect(r.invalid).toBe(true);
  expect(r.finishTime).toBe(null);
  selectTrack('pine');
});
it('has finite upward surface normals and smooth branch vertical merge heights', () => {
  const a = c.roadGeometry.getAttribute('normal');
  const positions = c.roadGeometry.getAttribute('position');
  for (const i of new Set(c.roadGeometry.index!.array)) {
    const normal = a.getY(i);
    expect(normal).toBeGreaterThan(0);
    if (normal <= 0.45) {
      const near = c.nearestTrack(positions.getX(i), positions.getZ(i));
      // Dense mesh resolves the authored ramp's steep side flank, outside its flat driving lane.
      const flank = c.jumps.some(
        (j) =>
          j.route === near.route &&
          (near.t - j.t) * c.TRACK_LENGTH >= -(j.id === 'eagles-leap' ? 32 : 18) - 1 &&
          (near.t - j.t) * c.TRACK_LENGTH <= 6 &&
          Math.abs(near.lateral - j.lateral) > 1.5 &&
          Math.abs(near.lateral - j.lateral) < 2.5,
      );
      expect(flank, JSON.stringify(near)).toBe(true);
    }
  }
  for (const b of c.branches) {
    for (const t of [b.start, b.start + 0.001, b.end - 0.001, b.end])
      expect(Math.abs(c.routePose(t, b.id).p.y - c.poseAt(t).p.y)).toBeLessThan(0.3);
  }
});

it('does not commit main-line racers to a nearby branch before physical separation', () => {
  for (const b of c.branches)
    for (let t = b.start; t < b.start + 0.025; t += 0.0005) {
      const p = c.routePose(t, 'main', 3.5).p,
        n = c.projectProgress(p.x, p.z, t, 'main');
      expect(n.route).toBe('main');
    }
});
it('branch grades are bounded outside authored optional ramps', () => {
  for (const b of c.branches)
    for (let t = b.start + 0.0005; t < b.end - 0.0005; t += 0.0005) {
      if (c.jumps.some((j) => j.route === b.id && Math.abs(j.t - t) < 0.005)) continue;
      const a = c.routePose(t - 0.0002, b.id).p,
        p = c.routePose(t, b.id).p,
        d = c.routePose(t + 0.0002, b.id).p;
      const s1 = (p.y - a.y) / Math.hypot(p.x - a.x, p.z - a.z),
        s2 = (d.y - p.y) / Math.hypot(d.x - p.x, d.z - p.z);
      expect(Math.abs(s1)).toBeLessThan(0.45);
      expect(Math.abs(s2 - s1) / p.distanceTo(d)).toBeLessThan(0.08);
    }
});
