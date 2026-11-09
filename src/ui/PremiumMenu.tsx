import { branches as canyonBranches, routePose } from '../track/CanyonCarnival';
import { courseModeLabel, driveLabel } from './coursePresentation';
import { useModalFocus } from './useModalFocus';
import { useState } from 'react';
import {
  tracks,
  trackId,
  activeTrack,
  TRACK_INFO,
  TRACK_LENGTH,
  type TrackId,
} from '../track/ActiveTrack';
import { useGame } from '../game/store';
import { modeDefinitions } from '../game/Modes';
import { formatTime, type Mode } from '../game/RaceStateMachine';
import { getVehicle } from '../vehicle/VehicleRegistry';
import { difficulties, type Difficulty } from '../ai/RacingAI';
import { recordKey, gpRecordKey } from '../persistence/storage';
import { unlockAudio } from '../audio/engine';
import { VehiclePortrait } from './VehiclePortrait';

function MenuIcon({ name }: { name: 'race' | 'cup' | 'car' | 'circuit' | 'settings' }) {
  const paths = {
    race: 'M5 21V3m0 2c5-4 9 4 14 0v10c-5 4-9-4-14 0',
    cup: 'M7 3h10v6a5 5 0 0 1-10 0V3ZM7 5H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4M12 14v5m-4 2h8',
    car: 'M4 11l3-6h10l3 6M3 11h18v8H3v-8Zm3 8v2m12-2v2M6 14h2m8 0h2',
    circuit: 'M6 20c-8-4 1-7 1-11S12 1 16 4s9 5 4 8-6-1-7 4-4 6-7 4Z',
    settings:
      'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Zm6 9a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z',
  };
  return (
    <svg className="menu-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path
        d={paths[name]}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function TrackOutline({ id }: { id: TrackId }) {
  const samples = tracks[id].samples,
    xs = samples.map((s) => s.p.x),
    zs = samples.map((s) => s.p.z);
  const minX = Math.min(...xs),
    minZ = Math.min(...zs),
    scale = Math.min(150 / (Math.max(...xs) - minX), 150 / (Math.max(...zs) - minZ));
  const points = samples
    .filter((_, i) => i % 4 === 0)
    .map((s) => `${15 + (s.p.x - minX) * scale},${15 + (s.p.z - minZ) * scale}`);
  return (
    <svg
      viewBox="0 0 180 180"
      role="img"
      aria-label={`${tracks[id].TRACK_INFO.name} track outline`}
    >
      {id === 'canyon' &&
        canyonBranches.map((b) => (
          <polyline
            key={b.id}
            points={Array.from({ length: 25 }, (_, i) => {
              const p = routePose(b.start + ((b.end - b.start) * i) / 24, b.id).p;
              return `${15 + (p.x - minX) * scale},${15 + (p.z - minZ) * scale}`;
            }).join(' ')}
            fill="none"
            stroke="#65dacf"
            strokeWidth="1.5"
          />
        ))}
      <polyline
        points={(tracks[id].format === 'sprint' ? points : [...points, points[0]]).join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {tracks[id].format === 'sprint' && (
        <circle
          cx={15 + (samples.at(-1)!.p.x - minX) * scale}
          cy={15 + (samples.at(-1)!.p.z - minZ) * scale}
          r="5"
          fill="#66e7dc"
        />
      )}
      <circle
        cx={15 + (samples[0].p.x - minX) * scale}
        cy={15 + (samples[0].p.z - minZ) * scale}
        r="5"
        fill="#ffd253"
      />
    </svg>
  );
}
export function PremiumMenu({
  open,
  changeTrack,
  mode,
  setMode,
  configure,
  blocked,
  active,
}: {
  blocked: boolean;
  active: string;
  open: (panel: 'garage' | 'settings' | 'controls') => void;
  changeTrack: (id: TrackId) => void;
  mode: Mode;
  setMode: (mode: Mode) => void;
  configure: (gp?: boolean) => void;
}) {
  const { save, settings } = useGame(),
    car = getVehicle(save.settings.vehicle),
    [circuits, setCircuits] = useState(false);
  useModalFocus(circuits, () => setCircuits(false));
  const sprint = activeTrack.format === 'sprint';
  const gp = mode === 'gp',
    recordMode = mode === 'challenge' ? 'challenge' : 'time';
  const record = save.records[recordKey(recordMode, car.id)];
  const cup = save.gpRecords[gpRecordKey(car.id, save.settings.difficulty)];
  const act = (action: () => void) => {
    unlockAudio();
    action();
  };
  return (
    <div className="premium-menu" inert={blocked}>
      <header className="club-header">
        <div className="club-brand">
          <b>
            APEX<span> /</span>
          </b>
          <small>APEX MOTOR CLUB</small>
        </div>
        <nav aria-label="Main navigation">
          <button
            className={active === 'race' && !circuits ? 'selected' : ''}
            aria-current={active === 'race' && !circuits ? 'page' : undefined}
            onClick={() => act(() => configure())}
          >
            <MenuIcon name="race" /> Race
          </button>
          <button
            className={active === 'gp' ? 'selected' : ''}
            aria-current={active === 'gp' ? 'page' : undefined}
            onClick={() =>
              act(() => {
                setMode('gp');
                configure(true);
              })
            }
          >
            <MenuIcon name="cup" /> Grand Prix
          </button>
          <button
            className={active === 'garage' ? 'selected' : ''}
            aria-current={active === 'garage' ? 'page' : undefined}
            onClick={() => act(() => open('garage'))}
          >
            <MenuIcon name="car" /> Garage
          </button>
          <button
            className={circuits ? 'selected' : ''}
            aria-current={circuits ? 'page' : undefined}
            onClick={() => act(() => setCircuits(true))}
          >
            <MenuIcon name="circuit" /> Circuits
          </button>
          <button
            className={active === 'settings' ? 'selected' : ''}
            aria-current={active === 'settings' ? 'page' : undefined}
            onClick={() => act(() => open('settings'))}
          >
            <MenuIcon name="settings" /> Settings
          </button>
        </nav>
        <small className="club-version">LOCAL EDITION · 0.8.0</small>
      </header>
      <main className="club-hero">
        <div className="eyebrow">THREE PERSONALITIES. YOUR RACING LINE.</div>
        <h1>
          Find your
          <br />
          <em>racing line.</em>
        </h1>
        <p>
          {trackId === 'pine'
            ? 'Sunlit forest. Sweeping corners. Your next perfect lap.'
            : trackId === 'coast'
              ? 'Ocean causeways. Hidden caverns. A turquoise horizon.'
              : 'Seven worlds. Four choices. One canyon adventure.'}
          <br />
          Make every corner count.
        </p>
        <button className="primary club-start" onClick={() => act(() => configure(gp))}>
          {driveLabel(trackId)} <span>→</span>
        </button>
        <small className="race-summary">
          {courseModeLabel(mode, sprint)} ·{' '}
          {gp
            ? difficulties[save.settings.difficulty].label
            : mode === 'free'
              ? 'Explore at your pace'
              : sprint
                ? 'Point-to-point sprint'
                : `${modeDefinitions[mode].laps} ${modeDefinitions[mode].laps === 1 ? 'lap' : 'laps'}`}{' '}
          · Configure & start
        </small>
      </main>
      <aside className="club-circuit club-panel">
        <label className="eyebrow">
          SELECTED CIRCUIT
          <select
            aria-label="Circuit"
            value={trackId}
            onChange={(e) => changeTrack(e.target.value as TrackId)}
          >
            {Object.entries(tracks).map(([id, t]) => (
              <option key={id} value={id}>
                {t.TRACK_INFO.name}
              </option>
            ))}
          </select>
        </label>
        <div className="circuit-title">
          <h2>{TRACK_INFO.name}</h2>
          <TrackOutline id={trackId} />
        </div>
        <div className="circuit-facts">
          <span>
            <small>DIFFICULTY</small>
            {TRACK_INFO.difficulty}
          </span>
          <span>
            <small>LENGTH</small>
            {(TRACK_LENGTH / 1000).toFixed(2)} km
          </span>
          <span>
            <small>ENVIRONMENT</small>
            {trackId === 'pine'
              ? 'Alpine forest'
              : trackId === 'coast'
                ? 'Coastal / Lagoon'
                : 'Canyon / Festival'}
          </span>
        </div>
        <p>
          {trackId === 'pine'
            ? 'Banked sweepers, wooded hills and the optional Pine Leap.'
            : trackId === 'coast'
              ? 'Six island districts, two tunnels and Lagoon Leap with a level bypass.'
              : 'Seven desert districts, route choices, boost pads and Eagle’s Leap.'}
        </p>
        <button className="club-text" onClick={() => setCircuits(true)}>
          Explore circuits <span>↗</span>
        </button>
      </aside>
      <section className="club-cards" aria-label="Race configuration">
        <button
          className="club-panel car-card"
          onClick={() => act(() => open('garage'))}
          aria-label="Open garage"
        >
          <span className="eyebrow">
            SELECTED CAR <span>↗</span>
          </span>
          <div className="car-card-body">
            <VehiclePortrait />
            <div>
              <h3>{car.name.replace(' ', '\n')}</h3>
              {['Speed', 'Acceleration', 'Handling'].map((name, i) => (
                <label key={name}>
                  {name}
                  <meter min="0" max="100" value={car.stats[i]} />
                </label>
              ))}
            </div>
          </div>
        </button>
        <div className="club-panel mode-card">
          <label className="eyebrow" htmlFor="club-mode">
            GAME MODE
          </label>
          <select
            id="club-mode"
            aria-label="Game mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
          >
            {Object.entries(modeDefinitions).map(([id, m]) => (
              <option key={id} value={id} disabled={id === 'challenge' && trackId !== 'pine'}>
                {courseModeLabel(id as Mode, sprint)}
              </option>
            ))}
          </select>
          <p>
            {mode === 'free'
              ? sprint
                ? 'Explore all seven districts at your pace.'
                : 'Explore the circuit. Find your flow.'
              : mode === 'gp'
                ? sprint
                  ? 'Three rivals. One sprint. One podium.'
                  : 'Three rivals. Three laps. One podium.'
                : mode === 'challenge'
                  ? 'A one-lap slalom. Every impact counts.'
                  : sprint
                    ? 'One clean sprint. Master every route choice.'
                    : 'Three clean laps. Chase your personal best.'}
          </p>
          <small>
            {trackId !== 'pine'
              ? 'Obstacle Challenge available on Pine Valley'
              : 'All four game modes available'}
          </small>
        </div>
        <div className="club-panel difficulty-card">
          <label className="eyebrow" htmlFor="club-difficulty">
            DIFFICULTY
          </label>
          <div className="difficulty-bars" aria-hidden="true">
            ▂ ▅ █
          </div>
          <select
            id="club-difficulty"
            aria-label="Quick AI difficulty"
            disabled={!gp}
            value={save.settings.difficulty}
            onChange={(e) => settings({ difficulty: e.target.value as Difficulty })}
          >
            {Object.entries(difficulties).map(([id, d]) => (
              <option value={id} key={id}>
                {d.label}
              </option>
            ))}
          </select>
          <small>
            {gp ? 'Shared physics. No catch-up boosts.' : 'Applies to Grand Prix opponents'}
          </small>
        </div>
        <div className="club-panel best-card">
          <span className="eyebrow">
            {gp ? 'GRAND PRIX BEST' : `${courseModeLabel(recordMode, sprint).toUpperCase()} BEST`}
          </span>
          <strong>
            {gp
              ? cup
                ? `P${cup.bestPosition} · ${formatTime(cup.bestTime)}`
                : 'Set your first result'
              : record?.bestTotal
                ? formatTime(record.bestTotal)
                : 'Set your first time'}
          </strong>
          <p>
            {TRACK_INFO.name} · {car.name.split(' ')[1]}
          </p>
          <small>
            {gp
              ? sprint
                ? 'Sprint · selected AI difficulty'
                : '3-lap cup · selected AI difficulty'
              : recordMode === 'challenge'
                ? '1 lap + penalties · local record'
                : sprint
                  ? '1 clean sprint · local record'
                  : '3 clean laps · local record'}
          </small>
        </div>
        <div className="club-panel quick-card">
          <button className="eyebrow club-text" onClick={() => open('settings')}>
            QUICK SETTINGS <span>↗</span>
          </button>
          <label>
            <button
              aria-label={save.settings.muted ? 'Unmute audio' : 'Mute audio'}
              onClick={() => act(() => settings({ muted: !save.settings.muted }))}
            >
              {save.settings.muted ? '◌' : '♫'}
            </button>
            Audio
            <input
              aria-label="Quick master volume"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={save.settings.master}
              onChange={(e) => act(() => settings({ master: Number(e.target.value) }))}
            />
          </label>
          <label>
            Graphics
            <select
              aria-label="Quick graphics"
              value={save.settings.quality}
              onChange={(e) =>
                settings({ quality: e.target.value as typeof save.settings.quality })
              }
            >
              {['auto', 'low', 'medium', 'high'].map((q) => (
                <option key={q} value={q}>
                  {q[0].toUpperCase() + q.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <button className="club-text" onClick={() => open('controls')}>
            Controls <span>Keyboard ↗</span>
          </button>
        </div>
      </section>
      <footer className="club-footer">
        <b>
          APEX<span> /</span>
        </b>
        <span>PINE VALLEY　 /　 CORAL COAST　 /　 CANYON CARNIVAL</span>
        <small>
          <kbd>Tab</kbd> Navigate　 <kbd>Enter</kbd> Select
        </small>
      </footer>
      {circuits && (
        <div className="scrim">
          <section
            className="dialog circuit-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Circuit selection"
          >
            <div className="eyebrow">APEX / DESTINATIONS</div>
            <h2>Three worlds. Your line.</h2>
            <div className="circuit-choices">
              {Object.entries(tracks).map(([id, t]) => (
                <button
                  key={id}
                  className={`destination ${id === trackId ? 'selected' : ''}`}
                  onClick={() => {
                    changeTrack(id as TrackId);
                    setCircuits(false);
                  }}
                >
                  <img
                    className="destination-image"
                    src={`${import.meta.env.BASE_URL}previews/${id}.jpg`}
                    alt={`${t.TRACK_INFO.name} in-game scenery`}
                    width="640"
                    height="360"
                    loading="lazy"
                  />
                  <TrackOutline id={id as TrackId} />
                  <h3>{t.TRACK_INFO.name}</h3>
                  <p>
                    {(t.TRACK_LENGTH / 1000).toFixed(2)} km · {t.TRACK_INFO.difficulty}
                  </p>
                  <small>
                    {id === 'pine'
                      ? 'Forest · banked sweep · Pine Leap'
                      : id === 'coast'
                        ? 'Coast · Crystal Caverns · Lagoon Leap'
                        : 'Sprint · seven districts · four route choices'}
                  </small>
                  <strong>
                    {formatTime(
                      save.records[recordKey('time', car.id, t.TRACK_LAYOUT_ID)]?.bestTotal ?? null,
                    )}
                  </strong>
                  <small>
                    {courseModeLabel('time', t.format === 'sprint')} · {car.name.split(' ')[1]} ·{' '}
                    {t.format === 'sprint' ? 'point-to-point' : '3 laps'}
                  </small>
                </button>
              ))}
            </div>
            <button className="primary" onClick={() => setCircuits(false)}>
              Back →
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
