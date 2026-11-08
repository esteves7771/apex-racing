export type ObstacleType = 'cone' | 'barrel' | 'crate';
export const challengeRules = {
  penalties: { cone: 1, barrel: 3, crate: 5 },
  minimumImpactSpeed: 1.5,
  recontactCooldown: 2,
} as const;
