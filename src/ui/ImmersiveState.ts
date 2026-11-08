export interface ImmersivePlatform {
  request?: () => Promise<void>;
  fullscreen: () => boolean;
  lock?: () => Promise<void>;
}
export async function enterImmersive(platform: ImmersivePlatform): Promise<string> {
  if (!platform.request)
    return 'Fullscreen is unavailable here. Continue in your browser and rotate your phone manually.';
  try {
    await platform.request();
  } catch {
    return 'Fullscreen was declined. Browser play is ready; rotate your phone to landscape.';
  }
  if (!platform.fullscreen()) return 'Browser play is ready. Fullscreen is not active.';
  try {
    if (platform.lock) await platform.lock();
    else return 'Fullscreen is active. Rotate your phone to landscape manually.';
  } catch {
    return platform.fullscreen()
      ? 'Fullscreen is active. Automatic rotation is unavailable; rotate your phone manually.'
      : 'Browser play is ready. Fullscreen is not active.';
  }
  return platform.fullscreen()
    ? 'Fullscreen is active. Landscape requested.'
    : 'Browser play is ready. Fullscreen is not active.';
}
export function browserImmersion(): ImmersivePlatform {
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (mode: string) => Promise<void>;
  };
  return {
    request:
      document.fullscreenEnabled && document.documentElement.requestFullscreen
        ? () => document.documentElement.requestFullscreen({ navigationUI: 'hide' })
        : undefined,
    fullscreen: () => !!document.fullscreenElement,
    lock: orientation?.lock ? () => orientation.lock!('landscape') : undefined,
  };
}
export function unlockLandscape() {
  try {
    screen.orientation?.unlock?.();
  } catch {
    /* Unsupported or inactive document. */
  }
}
