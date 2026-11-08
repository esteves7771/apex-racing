import { useEffect, type PointerEvent } from 'react';
import { race, telemetry, useGame } from '../game/store';
import { touchInput, type DriveAction } from '../input/TouchInput';
import { clearDrivingInput } from '../input/keyboard';
import { useTouchDevice } from '../input/device';
import { unlockAudio } from '../audio/engine';
export function TouchControls() {
  const touch = useTouchDevice(),
    phase = useGame(() => race.phase);
  const active = phase === 'RACING' || phase === 'COUNTDOWN' || phase === 'FINISHING';
  useEffect(() => {
    if (!active) clearDrivingInput();
    return () => touchInput.clear();
  }, [active]);
  useEffect(() => {
    const clear = () => touchInput.clear();
    window.addEventListener('resize', clear);
    window.addEventListener('orientationchange', clear);
    return () => {
      window.removeEventListener('resize', clear);
      window.removeEventListener('orientationchange', clear);
    };
  }, []);
  if (!touch || !active) return null;
  const release = (e: PointerEvent<HTMLButtonElement>) => {
    touchInput.release(e.pointerId);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const button = (action: DriveAction, label: string, text: string) => (
    <button
      key={action}
      className={'touch-drive touch-' + action}
      aria-label={label}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        e.preventDefault();
        unlockAudio();
        if (!useGame.getState().save.settings.controlsSeen)
          useGame.getState().settings({ controlsSeen: true });
        e.currentTarget.setPointerCapture(e.pointerId);
        touchInput.press(e.pointerId, action);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={(e) => touchInput.release(e.pointerId)}
    >
      {text}
    </button>
  );
  return (
    <div className="touch-controls" aria-label="Touch driving controls">
      <div className="touch-steering">
        {button('left', 'Steer left', '◀')}
        {button('right', 'Steer right', '▶')}
      </div>
      <div className="touch-pedals">
        {button('drift', 'Handbrake drift', 'DRIFT')}
        {button('brake', 'Brake', 'BRAKE')}
        {button('throttle', 'Accelerate', 'GO')}
      </div>
      <div className="touch-actions">
        <button
          aria-label="Switch camera"
          onClick={() => {
            telemetry.camera = 1 - telemetry.camera;
          }}
        >
          CAM
        </button>
        <button
          aria-label="Reset car"
          onClick={() => {
            if (race.phase === 'RACING') telemetry.resetSerial++;
            clearDrivingInput();
          }}
        >
          RESET
        </button>
      </div>
    </div>
  );
}
