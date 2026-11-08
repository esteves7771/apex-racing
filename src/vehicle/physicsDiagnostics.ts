import type RAPIER from '@dimforge/rapier3d-compat';
import { create } from 'zustand';

export const usePhysicsDebug = create<{
  enabled: boolean;
  toggle: () => void;
  wireframes: boolean;
  setWireframes: (value: boolean) => void;
  aiLines: boolean;
  setAILines: (value: boolean) => void;
}>((set) => ({
  enabled: false,
  aiLines: false,
  setAILines: (aiLines) => set({ aiLines }),
  wireframes: false,
  setWireframes: (wireframes) => set({ wireframes }),
  toggle: () => set((s) => ({ enabled: !s.enabled })),
}));
type Vec = { x: number; y: number; z: number };
export const physicsDiagnostics = {
  tick: 0,
  centerOfMass: { x: 0, y: 0, z: 0 } as Vec,
  linear: { x: 0, y: 0, z: 0 } as Vec,
  angular: { x: 0, y: 0, z: 0 } as Vec,
  grounded: false,
  controllerAcceleration: 0,
  engineForce: 0,
  brakeForce: 0,
  solverDelta: { x: 0, y: 0, z: 0 } as Vec,
  forwardLoss: 0,
  peakForwardLoss: 0,
  contacts: [] as { collider: number; normal: Vec; impulse: number; points: number }[],
  impacts: [] as { position: Vec; loss: number; impulse: number; normal: Vec }[],
  samples: [] as { tick: number; position: Vec; speed: number; grounded: boolean; loss: number }[],
};
export function capturePhysicsStep(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
  before: Vec,
  forward: Vec,
) {
  const d = physicsDiagnostics,
    after = body.linvel();
  d.centerOfMass = { ...body.worldCom() };
  d.linear = { ...after };
  d.angular = { ...body.angvel() };
  d.solverDelta = { x: after.x - before.x, y: after.y - before.y, z: after.z - before.z };
  d.forwardLoss = -(d.solverDelta.x * forward.x + d.solverDelta.z * forward.z);
  d.peakForwardLoss = Math.max(d.peakForwardLoss, d.forwardLoss);
  d.contacts = [];
  d.tick++;
  d.samples.push({
    tick: d.tick,
    position: { ...body.translation() },
    speed: after.x * forward.x + after.z * forward.z,
    grounded: d.grounded,
    loss: d.forwardLoss,
  });
  if (d.samples.length > 600) d.samples.shift();
  world.contactPairsWith(body.collider(0), (other) =>
    world.contactPair(body.collider(0), other, (m) => {
      if (!m.numContacts()) return;
      const impulse = Array.from({ length: m.numContacts() }, (_, i) => m.contactImpulse(i)).reduce(
        (a, b) => a + b,
        0,
      );
      d.contacts.push({
        collider: other.handle,
        normal: { ...m.normal() },
        impulse,
        points: m.numContacts(),
      });
    }),
  );
  if (d.forwardLoss > 0.8) {
    const contact = d.contacts.reduce((a, b) => (b.impulse > a.impulse ? b : a), {
      impulse: 0,
      normal: { x: 0, y: 0, z: 0 },
    });
    d.impacts.push({
      position: { ...body.translation() },
      loss: d.forwardLoss,
      impulse: contact.impulse,
      normal: contact.normal,
    });
    if (d.impacts.length > 120) d.impacts.shift();
  }
}
