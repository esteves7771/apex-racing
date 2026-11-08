import { useTouchDevice } from '../input/device';
import { trackId, selectTrack, tracks, type TrackId } from '../track/ActiveTrack';
import { useEffect, useState } from 'react';
import { race, telemetry, useGame } from '../game/store';
import { formatTime, type Mode } from '../game/RaceStateMachine';
import { clearDrivingInput } from '../input/keyboard';
import { unlockAudio } from '../audio/engine';
import {
  samples,
  TRACK_LENGTH,
  TRACK_INFO,
  trackFeatures,
  poseAt,
  nearestTrack,
  ROAD_WIDTH,
  checkpoints,
} from '../track/ActiveTrack';
import { vehicleConfig } from '../vehicle/VehicleConfig';
import { getVehicle } from '../vehicle/VehicleRegistry';
import { recordKey, gpRecordKey } from '../persistence/storage';
import { modeDefinitions } from '../game/Modes';
import { Garage } from './Garage';
import { challengeRules } from '../game/ChallengeRules';
import { difficulties, rivals, type Difficulty } from '../ai/RacingAI';
let mapCache: ReturnType<typeof buildMinimap> | undefined, mapTrack: TrackId | undefined;
function minimap() {
  if (!mapCache || mapTrack !== trackId) {
    mapTrack = trackId;
    mapCache = buildMinimap();
  }
  return mapCache;
}
function buildMinimap() {
  const xs = samples.map((s) => s.p.x),
    zs = samples.map((s) => s.p.z),
    minX = Math.min(...xs),
    minZ = Math.min(...zs),
    scale = Math.min(160 / (Math.max(...xs) - minX), 165 / (Math.max(...zs) - minZ));
  const x = (v: number) => 10 + (v - minX) * scale,
    z = (v: number) => 12 + (v - minZ) * scale;
  return {
    x,
    z,
    points: samples
      .filter((_, i) => i % 4 === 0)
      .map((s) => `${x(s.p.x)},${z(s.p.z)}`)
      .join(' '),
  };
}
export function changeTrack(id: TrackId) {
  selectTrack(id);
  useGame.getState().settings({ track: id });
  telemetry.resetSerial++;
  useGame.getState().publish();
}
export function startRace(mode: Mode) {
  if (mode === 'challenge' && trackId !== 'pine') changeTrack('pine');
  clearDrivingInput();
  unlockAudio();
  const settings = useGame.getState().save.settings;
  race.start(mode, { vehicle: settings.vehicle, difficulty: settings.difficulty });
  telemetry.resetSerial++;
  useGame.getState().publish();
}
function Controls() {
  const touch = useTouchDevice();
  if (touch)
    return (
      <p>
        Hold GO and a steering button together. BRAKE slows or reverses; DRIFT uses the handbrake.
        CAM switches views, RESET returns to a valid checkpoint, and Ⅱ pauses. Landscape gives a
        wider view.
      </p>
    );
  return (
    <div className="control-grid">
      <span>
        <kbd>W ↑</kbd> Accelerate
      </span>
      <span>
        <kbd>S ↓</kbd> Brake / reverse
      </span>
      <span>
        <kbd>A D ← →</kbd> Steer
      </span>
      <span>
        <kbd>SPACE</kbd> Handbrake drift
      </span>
      <span>
        <kbd>R</kbd> Reset to checkpoint
      </span>
      <span>
        <kbd>C</kbd> Chase / eagle camera
      </span>
      <span>
        <kbd>ESC</kbd> Pause / resume
      </span>
      <span>Stay on the road. Pass every checkpoint in order.</span>
    </div>
  );
}
function Settings() {
  const { save, settings } = useGame(),
    s = save.settings;
  return (
    <div className="settings">
      <label>
        Graphics
        <select
          aria-label="Graphics"
          value={s.quality}
          onChange={(e) =>
            settings({ quality: e.target.value as 'auto' | 'high' | 'medium' | 'low' })
          }
        >
          <option value="auto">Auto · measured performance</option>
          <option value="high">High · shadows / 1.6× DPR</option>
          <option value="medium">Medium · balanced / 1.25× DPR</option>
          <option value="low">Low · no shadows / 1× DPR</option>
        </select>
      </label>
      <label>
        Touch steering sensitivity
        <input
          aria-label="Touch steering sensitivity"
          type="range"
          min="0.5"
          max="1.5"
          step="0.1"
          value={s.steeringSensitivity}
          onChange={(e) => settings({ steeringSensitivity: Number(e.target.value) })}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={s.reducedMotion}
          onChange={(e) => settings({ reducedMotion: e.target.checked })}
        />{' '}
        Reduced camera motion
      </label>
      <label>
        Effects density
        <select
          value={s.effects}
          onChange={(e) => settings({ effects: e.target.value as 'full' | 'low' })}
        >
          <option value="full">Full · living world</option>
          <option value="low">Low · fewer particles</option>
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={!s.muted}
          onChange={(e) => {
            unlockAudio();
            settings({ muted: !e.target.checked });
          }}
        />{' '}
        Audio enabled
      </label>
      {(['master', 'music', 'vehicleVolume', 'sfx', 'ambient'] as const).map((k) => (
        <label key={k}>
          {
            {
              master: 'Master volume',
              music: 'Music',
              vehicleVolume: 'Engine & tires',
              sfx: 'Sound effects',
              ambient: 'Ambient',
            }[k]
          }
          <input
            aria-label={k + ' volume'}
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={s[k]}
            onChange={(e) => {
              unlockAudio();
              settings({ [k]: Number(e.target.value) });
            }}
          />
        </label>
      ))}
      <small>
        Original APEX soundtrack · menu 104 / racing 164 / challenge 132 BPM. Audio starts after
        interaction. All cues are optional.
      </small>
    </div>
  );
}
export function Interface() {
  const touch = useTouchDevice();
  const map = minimap(),
    mapPoints = map.points;
  useGame((s) => s.revision);
  const { save, storageOK } = useGame();
  const vehicle = getVehicle(save.settings.vehicle),
    records = save.records[
      recordKey(race.mode === 'challenge' ? 'challenge' : 'time', vehicle.id)
    ] ?? {
      bestLap: null,
      bestTotal: null,
    };
  const [panel, setPanel] = useState<'controls' | 'settings' | 'garage' | null>(null),
    [tips, setTips] = useState(!save.settings.controlsSeen),
    [tuning, setTuning] = useState(false);
  const [cupSetup, setCupSetup] = useState(false);
  const phase = race.phase,
    active = ['COUNTDOWN', 'RACING', 'FINISHING', 'PAUSED'].includes(phase);
  const near = nearestTrack(telemetry.x, telemetry.z),
    leap = poseAt(trackFeatures.jump.crest).p;
  useEffect(() => {
    if (!tips || phase !== 'RACING') return;
    const timer = setTimeout(() => {
      if (Math.abs(telemetry.speed) > 3) {
        setTips(false);
        useGame.getState().settings({ controlsSeen: true });
      }
    }, 14000);
    return () => clearTimeout(timer);
  }, [tips, phase]);
  useEffect(() => {
    const enter = (e: KeyboardEvent) => {
      if (e.code !== 'Enter' || (e.target as HTMLElement)?.closest('button,input,select')) return;
      if (panel || cupSetup) return;
      if (race.phase === 'MENU') {
        race.phase = 'MODE_SELECT';
        useGame.getState().publish();
      } else if (race.phase === 'MODE_SELECT' || race.phase === 'RESULTS')
        startRace(race.phase === 'RESULTS' ? race.mode : 'time');
    };
    window.addEventListener('keydown', enter);
    return () => window.removeEventListener('keydown', enter);
  }, [panel, cupSetup]);
  const quit = () => {
    race.phase = 'MENU';
    clearDrivingInput();
    setPanel(null);
    useGame.getState().publish();
  };
  return (
    <div className="interface">
      <header className="topbar">
        <div className="wordmark">
          APEX<span> / </span>
        </div>
        <span>APEX MOTOR CLUB</span>
        <span className="version">LOCAL EDITION · 0.6.1</span>
      </header>
      {['MENU', 'MODE_SELECT'].includes(phase) && (
        <>
          <main className="menu">
            {touch && phase === 'MODE_SELECT' && (
              <p className="touch-intro">
                Hold GO + steering together · landscape recommended. CAM changes view; Ⅱ pauses.
              </p>
            )}
            <div className="eyebrow">THREE PERSONALITIES. YOUR RACING LINE.</div>
            <h1>
              Find your
              <br />
              <em>racing line.</em>
            </h1>
            <p>
              {trackId === 'pine'
                ? 'A winding ribbon of asphalt. A forest of pines.'
                : 'Cliffside curves. Crystal caverns. A turquoise horizon.'}
              <br />
              And the next fraction of a second.
            </p>
            {phase === 'MENU' ? (
              <>
                <button
                  className="primary"
                  onClick={() => {
                    unlockAudio();
                    race.phase = 'MODE_SELECT';
                    useGame.getState().publish();
                  }}
                >
                  {trackId === 'pine' ? 'Drive Pine Valley' : 'Drive Coral Coast'} <span>↗</span>
                </button>
                <nav>
                  <button onClick={() => setPanel('garage')}>Garage</button>
                  <button onClick={() => setPanel('controls')}>Controls</button>
                  <button onClick={() => setPanel('settings')}>Settings</button>
                </nav>
              </>
            ) : (
              <>
                <button className="primary" onClick={() => startRace('time')}>
                  Time attack <span>3 LAPS →</span>
                </button>
                <button className="secondary" onClick={() => startRace('free')}>
                  Free drive <span>NO CLOCK →</span>
                </button>
                <button
                  className="secondary"
                  disabled={trackId !== 'pine'}
                  onClick={() => startRace('challenge')}
                >
                  Obstacle Challenge <span>PINE VALLEY · 1 LAP →</span>
                </button>
                <button className="secondary cup-entry" onClick={() => setCupSetup(true)}>
                  Grand Prix{' '}
                  <span>{trackId === 'pine' ? 'PINE VALLEY CUP →' : 'CORAL COAST CUP →'}</span>
                </button>
                <button className="text-button" onClick={() => setPanel('garage')}>
                  {vehicle.name} · Change car
                </button>
                <button className="text-button" onClick={quit}>
                  ← Back
                </button>
              </>
            )}
            <div className="record">
              {race.mode === 'challenge' ? 'CHALLENGE' : 'TIME ATTACK'} BEST ·{' '}
              {vehicle.name.split(' ')[1]} <strong>{formatTime(records.bestTotal)}</strong>
              <small>
                {Object.keys(save.archives).length
                  ? 'Previous Pine Valley layout records preserved'
                  : race.mode === 'challenge'
                    ? '1 lap + penalties · stored on this device'
                    : '3 clean laps · stored on this device'}
              </small>
            </div>
          </main>
          <div className="track-card">
            <label>
              Choose circuit{' '}
              <select
                aria-label="Circuit"
                value={trackId}
                onChange={(e) => changeTrack(e.target.value as TrackId)}
              >
                {Object.entries(tracks).map(([id, t]) => (
                  <option value={id} key={id}>
                    {t.TRACK_INFO.name}
                  </option>
                ))}
              </select>
            </label>
            <svg
              viewBox="0 0 180 190"
              style={{ width: 140, height: 140 }}
              aria-label="Track preview"
            >
              <polyline
                points={mapPoints + ' ' + mapPoints.split(' ')[0]}
                fill="none"
                stroke="#f6d35e"
                strokeWidth="3"
                strokeLinejoin="round"
              />
            </svg>
            <span>
              {trackId === 'pine' ? '01 / PINE VALLEY · EVOLUTION' : '02 / CORAL COAST RUSH'}
            </span>
            <strong>
              {trackId === 'pine' ? 'The forest is calling.' : 'Follow the island rhythm.'}
            </strong>
            <p>
              {(TRACK_LENGTH / 1000).toFixed(2)} km · {checkpoints.length} checkpoints ·{' '}
              {ROAD_WIDTH} m wide
            </p>
            <p className="track-detail">
              {TRACK_INFO.difficulty} ·{' '}
              {trackId === 'pine'
                ? 'banked sweep · optional Pine Leap'
                : 'six districts · two tunnels · Lagoon Leap + bypass'}
            </p>
            <span className="tag">
              {vehicle.name.toUpperCase()} / {vehicle.difficulty.toUpperCase()}
            </span>
          </div>
        </>
      )}
      {active && (
        <>
          <section className="timing glass">
            <div className="eyebrow">
              {modeDefinitions[race.mode].label.toUpperCase()}{' '}
              <b>
                {race.mode !== 'free'
                  ? `LAP ${Math.min(modeDefinitions[race.mode].laps, race.laps.length + 1)} / ${modeDefinitions[race.mode].laps}`
                  : TRACK_INFO.name.toUpperCase()}
              </b>
            </div>
            {race.mode === 'gp' && (
              <div className="cup-position">
                P{race.gp.position}
                <small>
                  {' '}
                  / {race.gp.racers.length} · {difficulties[race.gp.difficulty].label}
                </small>
              </div>
            )}
            <strong className="timer">
              {race.mode === 'free'
                ? 'NO LIMIT'
                : formatTime(
                    race.mode === 'gp'
                      ? (race.gp.player.progress.finishTime ?? race.elapsed)
                      : race.elapsed - race.lapStart,
                  )}
            </strong>
            <div className="time-row">
              <span>LAST</span>
              <b>{formatTime(race.laps.at(-1) ?? null)}</b>
            </div>
            <div className="time-row">
              <span>BEST</span>
              <b>
                {formatTime(
                  Math.min(records.bestLap ?? Infinity, ...race.laps) === Infinity
                    ? null
                    : Math.min(records.bestLap ?? Infinity, ...race.laps),
                )}
              </b>
            </div>
            <div className={race.invalid ? 'status invalid' : 'status'}>
              {race.invalid
                ? '● LAP INVALID'
                : `● ${race.mode === 'free' ? 'EXPLORE THE CIRCUIT' : `CHECKPOINT ${race.nextGate === 0 ? checkpoints.length : race.nextGate} / ${checkpoints.length}`}`}
            </div>
            {race.message && <small>{race.message}</small>}
            {race.hitMessage && <small aria-live="polite">{race.hitMessage}</small>}
            {race.mode === 'gp' && race.gp.positionMessage && (
              <small aria-live="polite">{race.gp.positionMessage}</small>
            )}
            {race.mode === 'challenge' && (
              <div className="challenge-penalty">
                +{race.penaltyTime}s · {race.hitIds.size} hit{race.hitIds.size === 1 ? '' : 's'}
                {race.hitIds.size === 0 ? ' · CLEAN' : ''}
                <small>{vehicle.name} · cones +1 / barrels +3 / crates +5</small>
              </div>
            )}
            {trackId === 'pine' && !race.invalid && near.t > 0.56 && near.t < 0.614 && (
              <small>↗ Pine Leap · left lane jumps / right stays level</small>
            )}
            {trackId === 'coast' &&
              near.t > trackFeatures.jump.approach - 0.018 &&
              near.t < trackFeatures.jump.end && (
                <small>Lagoon Leap · left lane 80+ km/h · right lane safe bypass</small>
              )}
          </section>
          <button
            className="pause-button glass"
            aria-label="Pause"
            onClick={() => {
              race.pause();
              useGame.getState().publish();
            }}
          >
            Ⅱ
          </button>
          <div className="minimap glass">
            <svg viewBox="0 0 180 190" aria-label="Circuit minimap">
              <polyline
                points={mapPoints + ' ' + mapPoints.split(' ')[0]}
                fill="none"
                stroke="#b9d6c6"
                strokeWidth="6"
                strokeLinejoin="round"
              />
              <circle cx={map.x(leap.x)} cy={map.z(leap.z)} r="4" fill="#f08062" />
              <circle cx={map.x(telemetry.x)} cy={map.z(telemetry.z)} r="4.5" fill="#f6d35e" />
              {race.mode === 'gp' &&
                race.gp.racers
                  .filter((r) => r.id !== 'player')
                  .map((r) => (
                    <circle key={r.id} cx={map.x(r.x)} cy={map.z(r.z)} r="3.5" fill={r.color}>
                      <title>{r.name}</title>
                    </circle>
                  ))}
            </svg>
            <span>{TRACK_INFO.name.toUpperCase()}</span>
          </div>
          <div className="speed">
            <span>
              {telemetry.airborne
                ? 'AIRBORNE'
                : telemetry.drift
                  ? 'DRIFT'
                  : telemetry.offroad
                    ? 'GRASS'
                    : vehicle.name.split(' ')[0]}
            </span>
            <strong>
              {Math.round(Math.abs(telemetry.speed) * 3.6)
                .toString()
                .padStart(3, '0')}
            </strong>
            <span>
              KM/H{' '}
              <b>
                {telemetry.speed < -0.5
                  ? 'R'
                  : Math.abs(telemetry.speed) < 0.5
                    ? 'N'
                    : Math.min(5, Math.floor(Math.abs(telemetry.speed) / 9) + 1)}
              </b>
            </span>
          </div>
          <footer className="race-controls">
            <kbd>WASD</kbd> DRIVE <kbd>SPACE</kbd> DRIFT <kbd>R</kbd> RESET <kbd>C</kbd> CAMERA{' '}
            <kbd>ESC</kbd> PAUSE
          </footer>
        </>
      )}
      {phase === 'COUNTDOWN' && (
        <div className="countdown" aria-live="polite">
          {Math.ceil(race.countdown)}
          <small>FIND YOUR FOCUS</small>
          {race.mode === 'gp' && (
            <small>
              {[...race.gp.racers]
                .sort((a, b) => a.grid - b.grid)
                .map((r) => r.name)
                .join(' / ')}
            </small>
          )}
        </div>
      )}
      {phase === 'RACING' && race.mode !== 'free' && race.elapsed < 1 && (
        <div className="countdown go">GO</div>
      )}
      {phase === 'PAUSED' && !panel && (
        <div className="scrim">
          <section className="dialog">
            <div className="eyebrow">TAKE A BREATH</div>
            <h2>In the pits.</h2>
            <button
              className="primary"
              onClick={() => {
                race.resume();
                useGame.getState().publish();
              }}
            >
              Resume →
            </button>
            <button className="secondary" onClick={() => startRace(race.mode)}>
              Restart run
            </button>
            <button className="secondary" onClick={() => setPanel('settings')}>
              Settings
            </button>
            <button className="text-button" onClick={quit}>
              Main menu
            </button>
          </section>
        </div>
      )}
      {phase === 'FINISHING' && (
        <div className="cup-wait glass">
          Finished P{race.gp.position} · rivals racing
          <small>Remaining drivers have up to 20 seconds. Unfinished entries are DNF.</small>
        </div>
      )}
      {phase === 'RESULTS' && race.mode === 'gp' && (
        <div className="scrim">
          <section className="dialog results" data-record={race.newRecord}>
            <div className="eyebrow">
              {trackId === 'pine' ? 'PINE VALLEY CUP' : 'CORAL COAST CUP'} ·{' '}
              {difficulties[race.gp.difficulty].label.toUpperCase()}
            </div>
            <h2>
              {race.gp.position === 1
                ? 'Cup champion.'
                : race.gp.position <= 3
                  ? 'On the podium.'
                  : 'Every lap counts.'}
            </h2>
            <strong className="result-time">
              P{race.gp.position}{' '}
              {race.gp.position === 1
                ? '🏆'
                : race.gp.position === 2
                  ? '🥈'
                  : race.gp.position === 3
                    ? '🥉'
                    : ''}
            </strong>
            <ol className="classification">
              {race.gp.standings.map((r, i) => (
                <li key={r.id} data-player={r.id === 'player'}>
                  <b>
                    {i + 1}. {r.name}
                  </b>
                  <small>{getVehicle(r.vehicle).name}</small>
                  <strong>
                    {r.progress.finishTime === null ? 'DNF' : formatTime(r.progress.finishTime)}
                  </strong>
                </li>
              ))}
            </ol>
            <p>Your best lap {formatTime(Math.min(...race.laps))}</p>
            <small>Official shared-clock times · unfinished rivals are not assigned times.</small>
            <button className="primary" onClick={() => startRace('gp')}>
              Race again ↻
            </button>
            <button className="text-button" onClick={quit}>
              Main menu
            </button>
          </section>
        </div>
      )}
      {phase === 'RESULTS' && race.mode !== 'gp' && (
        <div className="scrim">
          <section className="dialog results" data-record={race.newRecord}>
            <div className="eyebrow">
              {race.newRecord
                ? 'A NEW PERSONAL BEST'
                : race.mode === 'challenge'
                  ? 'CHALLENGE COMPLETE'
                  : 'THREE CLEAN LAPS'}
            </div>
            <h2>{race.mode === 'challenge' ? 'Precision pays.' : 'Chasing fractions.'}</h2>
            <small>
              {vehicle.name} · {modeDefinitions[race.mode].label}
              {race.mode === 'challenge' ? ' · ADJUSTED TIME' : ''}
            </small>
            <strong className="result-time">{formatTime(race.adjustedTime)}</strong>
            {race.mode === 'challenge' && (
              <>
                <div className="time-row">
                  <span>ACTUAL TIME</span>
                  <b>{formatTime(race.elapsed)}</b>
                </div>
                {(['cone', 'barrel', 'crate'] as const).map((type) => (
                  <div className="time-row" key={type}>
                    <span>
                      {type.toUpperCase()} × {race.penalties[type]}
                    </span>
                    <b>+{race.penalties[type] * challengeRules.penalties[type]}s</b>
                  </div>
                ))}
                <p>
                  {race.hitIds.size === 0
                    ? '✦ CLEAN RUN'
                    : `${race.hitIds.size} obstacles hit · +${race.penaltyTime}s penalties`}
                </p>
              </>
            )}
            {race.laps.map((t, i) => (
              <div className="time-row" key={i}>
                <span>
                  LAP 0{i + 1}
                  {t === Math.min(...race.laps) ? ' · BEST' : ''}
                </span>
                <b>{formatTime(t)}</b>
              </div>
            ))}
            <p>Best lap {formatTime(records.bestLap)}</p>
            {race.improvement !== null && race.improvement > 0 && (
              <p className="record-gain">
                ✦ {formatTime(race.improvement)} faster than your previous run
              </p>
            )}
            <button className="primary" onClick={() => startRace(race.mode)}>
              Go again <span>↻</span>
            </button>
            <button className="text-button" onClick={quit}>
              Main menu
            </button>
          </section>
        </div>
      )}
      {panel && (
        <div className="scrim">
          <section className={`dialog ${panel === 'garage' ? 'garage-dialog' : ''}`}>
            <div className="eyebrow">APEX / {panel.toUpperCase()}</div>
            <h2>
              {panel === 'garage'
                ? 'Make it yours.'
                : panel === 'controls'
                  ? 'Feel the road.'
                  : 'Set your pace.'}
            </h2>
            {panel === 'settings' ? (
              <Settings />
            ) : panel === 'controls' ? (
              <Controls />
            ) : (
              <Garage onConfirm={() => setPanel(null)} />
            )}
            <button className="primary" onClick={() => setPanel(null)}>
              Back →
            </button>
          </section>
        </div>
      )}
      {cupSetup && (
        <div className="scrim">
          <section className="dialog cup-setup">
            <div className="eyebrow">GRAND PRIX / {TRACK_INFO.name.toUpperCase()}</div>
            <h2>Meet your rivals.</h2>
            <p>3 laps · 4 physical cars · clean circuit · no catch-up boosts</p>
            <p>
              You: <b>{vehicle.name}</b> · Grid 4
            </p>
            <label>
              AI difficulty
              <select
                aria-label="AI difficulty"
                value={save.settings.difficulty}
                onChange={(e) =>
                  useGame.getState().settings({ difficulty: e.target.value as Difficulty })
                }
              >
                {Object.entries(difficulties).map(([id, d]) => (
                  <option key={id} value={id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="cup-best">
              {(() => {
                const best = save.gpRecords[gpRecordKey(vehicle.id, save.settings.difficulty)];
                return best
                  ? `Your best: P${best.bestPosition} · ${formatTime(best.bestTime)} · ${best.podiums} podiums / ${best.cups} cups`
                  : 'New cup record · tracked separately for this car and difficulty';
              })()}
            </p>
            <div className="rival-roster">
              {[rivals[1], rivals[0], rivals[2]].map((r, i) => (
                <div key={r.id}>
                  <b style={{ color: r.color }}>
                    {i + 1}. {r.name}
                  </b>
                  <span>{getVehicle(r.vehicle).name}</span>
                  <small>{r.personality}</small>
                </div>
              ))}
            </div>
            <small>
              Rookie: patient lines · Club: confident pace · Pro: precise braking and passes. Every
              rival obeys its vehicle's handling. All use the level bypass.
            </small>
            <button
              className="primary"
              onClick={() => {
                setCupSetup(false);
                startRace('gp');
              }}
            >
              Start Grand Prix →
            </button>
            <button className="text-button" onClick={() => setCupSetup(false)}>
              Back to modes
            </button>
          </section>
        </div>
      )}
      {phase === 'RACING' && tips && !touch && (
        <div className="first-controls glass">
          <strong>Your first run</strong>
          <p>
            WASD / arrows to drive · Space to drift.
            <br />
            Pass all {checkpoints.length} gates, then cross the line.
          </p>
          <button
            onClick={() => {
              setTips(false);
              useGame.getState().settings({ controlsSeen: true });
            }}
          >
            Got it →
          </button>
        </div>
      )}
      {!storageOK && (
        <div className="storage-warning">Storage unavailable · records last for this session.</div>
      )}
      {import.meta.env.DEV && (
        <div className="dev-tools">
          <button onClick={() => setTuning(!tuning)}>Handling lab</button>
          {tuning && (
            <div className="glass">
              <small>Development tuning · session only</small>
              {(['grip', 'driftGrip', 'steering', 'acceleration'] as const).map((k) => (
                <label key={k}>
                  {k}
                  <input
                    type="range"
                    min={k === 'steering' ? 0.6 : 1}
                    max={k === 'steering' ? 2.5 : 20}
                    step="0.1"
                    defaultValue={vehicleConfig[k]}
                    onChange={(e) => (vehicleConfig[k] = Number(e.target.value))}
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
