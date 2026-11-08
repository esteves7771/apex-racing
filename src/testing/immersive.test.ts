import { it, expect } from 'vitest';
import { enterImmersive } from '../ui/ImmersiveState';
it('falls back when unsupported or denied, without requesting orientation', async () => {
  let lock = 0;
  expect(await enterImmersive({ fullscreen: () => false })).toContain('unavailable');
  expect(
    await enterImmersive({
      request: async () => {
        throw Error('denied');
      },
      fullscreen: () => false,
      lock: async () => {
        lock++;
      },
    }),
  ).toContain('declined');
  expect(lock).toBe(0);
});
it('requests fullscreen before landscape and handles lock rejection', async () => {
  const calls: string[] = [];
  expect(
    await enterImmersive({
      request: async () => {
        calls.push('fullscreen');
      },
      fullscreen: () => true,
      lock: async () => {
        calls.push('landscape');
        throw Error('unsupported');
      },
    }),
  ).toContain('manually');
  expect(calls).toEqual(['fullscreen', 'landscape']);
});
it('does not claim fullscreen when the user exits during orientation setup', async () => {
  let active = true;
  expect(
    await enterImmersive({
      request: async () => {},
      fullscreen: () => active,
      lock: async () => {
        active = false;
      },
    }),
  ).toContain('not active');
});
