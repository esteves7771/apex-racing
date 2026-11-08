import { poseAt, curve, surfaceAt } from '../track/PineValley';
import { type ObstacleType, challengeRules } from './ChallengeRules';
export type { ObstacleType } from './ChallengeRules';
export const obstaclePhysics = {
  cone: { mass: 3, half: [0.36, 0.48, 0.36], penalty: challengeRules.penalties.cone },
  barrel: { mass: 24, half: [0.53, 0.65, 0.53], penalty: challengeRules.penalties.barrel },
  crate: { mass: 55, half: [0.65, 0.65, 0.65], penalty: challengeRules.penalties.crate },
} as const;
const sections: { type: ObstacleType; t: number[]; offset: number }[] = [
  { type: 'cone', t: [0.055, 0.074, 0.094, 0.113], offset: 1.6 },
  { type: 'barrel', t: [0.277, 0.299, 0.32], offset: 3.3 },
  { type: 'crate', t: [0.437, 0.462, 0.485], offset: 3.3 },
  { type: 'cone', t: [0.785, 0.805], offset: 1.6 },
  { type: 'barrel', t: [0.829], offset: 3.3 },
  { type: 'crate', t: [0.852], offset: 3.3 },
];
export const obstacleLayout = sections.flatMap((s, section) =>
  s.t.map((t, i) => {
    const lateral = s.offset * (i % 2 ? -1 : 1),
      pose = poseAt(t),
      d = curve.getTangentAt(t),
      p = pose.p;
    p.x -= d.z * lateral;
    p.z += d.x * lateral;
    p.y = surfaceAt(p.x, p.z).height + obstaclePhysics[s.type].half[1] + 0.04;
    return { id: `${section}-${i}`, type: s.type, t, lateral, p, yaw: pose.yaw };
  }),
);
