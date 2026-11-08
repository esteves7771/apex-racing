import { useEffect, useState, type ReactNode } from 'react';
import { useTouchDevice } from '../input/device';
import { useGame, race } from '../game/store';
import { clearDrivingInput } from '../input/keyboard';
import { unlockAudio } from '../audio/engine';
import { browserImmersion, enterImmersive, unlockLandscape } from './ImmersiveState';
export function ImmersiveShell({ children }: { children: ReactNode }) {
  const touch = useTouchDevice(),
    preference = useGame((s) => s.save.settings.immersiveWelcome);
  const [accepted, setAccepted] = useState(
    () =>
      !preference ||
      matchMedia('(display-mode: standalone)').matches ||
      !!(navigator as Navigator & { standalone?: boolean }).standalone,
  );
  const [options, setOptions] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [full, setFull] = useState(!!document.fullscreenElement),
    [portrait, setPortrait] = useState(innerHeight > innerWidth),
    [phone] = useState(Math.min(screen.width, screen.height) <= 600),
    [guide, setGuide] = useState(true);
  const phase = useGame(() => race.phase);
  const welcome = touch && phone && !accepted;
  useEffect(() => {
    const resize = () => {
      setPortrait(innerHeight > innerWidth);
    };
    const sync = () => {
      const active = !!document.fullscreenElement;
      setFull(active);
      if (!active) {
        setMessage('Browser play is ready. Re-enter fullscreen from Display when you want.');
        unlockLandscape();
        clearDrivingInput();
        race.pause();
        useGame.getState().publish();
      }
    };
    const returning = () => {
      setFull(!!document.fullscreenElement);
      if (!document.fullscreenElement)
        setMessage('Browser play is ready. Fullscreen is not active.');
    };
    window.addEventListener('resize', resize);
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('visibilitychange', returning);
    window.addEventListener('pageshow', returning);
    return () => {
      window.removeEventListener('resize', resize);
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('visibilitychange', returning);
      window.removeEventListener('pageshow', returning);
      unlockLandscape();
    };
  }, []);
  const enter = async () => {
    if (busy) return;
    setBusy(true);
    clearDrivingInput();
    const pending = enterImmersive(browserImmersion());
    unlockAudio();
    const result = await pending;
    setMessage(result);
    setFull(!!document.fullscreenElement);
    setAccepted(true);
    setOptions(false);
    setBusy(false);
    setGuide(true);
  };
  const exit = async () => {
    try {
      await document.exitFullscreen?.();
      setMessage('Browser play is ready.');
    } catch {
      setMessage('Use your browser fullscreen exit control.');
    }
    setFull(!!document.fullscreenElement);
    unlockLandscape();
  };
  return (
    <>
      {!welcome && <div inert={options}>{children}</div>}
      {touch && !welcome && (
        <button
          className="immersive-display"
          aria-haspopup="dialog"
          onClick={() => {
            clearDrivingInput();
            race.pause();
            useGame.getState().publish();
            setOptions(true);
          }}
        >
          Display
        </button>
      )}
      {touch && !welcome && phone && portrait && guide && !options && (
        <button className="orientation-guide" onClick={() => setGuide(false)}>
          ↔ Rotate your phone for a wider racing view · dismiss
        </button>
      )}
      {message && !welcome && (phase === 'MENU' || phase === 'MODE_SELECT') && (
        <div className="immersive-status" role="status">
          {message}
          <button aria-label="Dismiss display message" onClick={() => setMessage('')}>
            ×
          </button>
        </div>
      )}
      {(welcome || options) && (
        <div className="immersive-scrim">
          <section
            className="immersive-card"
            role="dialog"
            aria-modal="true"
            aria-label={welcome ? 'APEX mobile welcome' : 'Display options'}
          >
            <div className="wordmark">
              APEX<span> /</span>
            </div>
            <div className="launch-stripe" aria-hidden="true" />
            <h1>{welcome ? 'Your next racing line.' : 'Your racing view.'}</h1>
            <p>
              Landscape gives you a wider view of the road. Fullscreen and automatic rotation depend
              on your browser.
            </p>
            <button className="primary" autoFocus disabled={busy} onClick={() => void enter()}>
              Enter Fullscreen Race
            </button>
            {full && (
              <button className="secondary" onClick={() => void exit()}>
                Exit Fullscreen
              </button>
            )}
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                clearDrivingInput();
                setAccepted(true);
                setOptions(false);
                unlockAudio();
              }}
            >
              Continue in Browser
            </button>
            <label>
              <input
                type="checkbox"
                checked={preference}
                onChange={(e) =>
                  useGame.getState().settings({ immersiveWelcome: e.target.checked })
                }
              />{' '}
              Show mobile welcome on future visits
            </label>
            <details>
              <summary>Rotation and Home Screen help</summary>
              <p>
                Rotate your phone manually if landscape lock is unavailable. On iPhone Safari, use
                Share → Add to Home Screen for an optional app-style launch. Installation is not
                required; browser play works without fullscreen.
              </p>
            </details>
          </section>
        </div>
      )}
    </>
  );
}
