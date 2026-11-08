import { useEffect, useReducer } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Mesh } from 'three';
import { physicsDiagnostics as d, usePhysicsDebug } from '../vehicle/physicsDiagnostics';
import { useGame, telemetry } from '../game/store';
import { race } from '../game/store';
import { performanceDiagnostics as perf } from '../render/frameDiagnostics';

export function PhysicsDebugToggle() {
  const [, refreshOptions] = useReducer((value: number) => value + 1, 0);
  const { enabled, toggle, wireframes, setWireframes } = usePhysicsDebug();
  const frame = perf.frames.latest();
  useGame((s) => s.revision);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code === 'F2') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [toggle]);
  const vec = (v: { x: number; y: number; z: number }) =>
    `${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}`;
  return (
    <div
      className="physics-debug-toggle"
      style={{
        position: 'absolute',
        right: 36,
        top: 155,
        zIndex: 20,
        pointerEvents: 'auto',
        fontSize: 11,
      }}
    >
      <button onClick={toggle} style={{ padding: 8, background: '#173d39', color: '#ffe2a0' }}>
        F2 · Physics {enabled ? 'ON' : 'OFF'}
      </button>
      {enabled && (
        <>
          <div style={{ background: '#102e2e', padding: 8, display: 'grid', gap: 5 }}>
            <label>
              <input
                type="checkbox"
                checked={usePhysicsDebug.getState().aiLines}
                onChange={(e) => usePhysicsDebug.getState().setAILines(e.target.checked)}
              />{' '}
              AI center/racing lines and lookahead targets
            </label>
            <label>
              <input
                type="checkbox"
                checked={wireframes}
                onChange={(e) => setWireframes(e.target.checked)}
              />{' '}
              Collider wireframes (extra rendering cost)
            </label>
            <label>
              <input
                type="checkbox"
                checked={perf.cameraDisabled}
                onChange={(e) => {
                  perf.cameraDisabled = e.target.checked;
                  refreshOptions();
                }}
              />{' '}
              Freeze camera for comparison
            </label>
            <label>
              <input
                type="checkbox"
                checked={perf.minimalEnvironment}
                onChange={(e) => {
                  perf.minimalEnvironment = e.target.checked;
                  refreshOptions();
                }}
              />{' '}
              Minimal environment for comparison
            </label>
          </div>
          <pre
            style={{
              background: '#102e2ef2',
              padding: 16,
              maxWidth: 480,
              maxHeight: '60vh',
              overflow: 'auto',
              color: '#fff',
              fontSize: 11,
              lineHeight: 1.6,
            }}
          >
            {`FPS ${perf.summary.fps.toFixed(1)} · frame ${perf.summary.frameMs.toFixed(2)} ms\nAvg / p95 / p99 ${perf.summary.average.toFixed(2)} / ${perf.summary.p95.toFixed(2)} / ${perf.summary.p99.toFixed(2)} ms\nPhysics 1/60 s · ${perf.summary.physicsHz.toFixed(1)} Hz · ${perf.summary.steps} substeps/frame\nPhysics CPU ${perf.summary.physicsMs.toFixed(2)} ms\nDraws ${perf.summary.calls} · triangles ${perf.summary.triangles}\nWebGL geometries ${perf.summary.geometries} · textures ${perf.summary.textures}\n`}
            {`Airborne ${telemetry.airborne} · vy ${telemetry.verticalSpeed.toFixed(2)} · landings ${telemetry.landingSerial}\n`}
            {race.mode === 'gp' &&
              race.gp.racers
                .map(
                  (r) =>
                    `${r.name}: P${race.gp.standings.indexOf(r) + 1} lap ${r.progress.laps.length} gate ${r.progress.nextGate} t=${r.progress.t.toFixed(3)}\n${r.ai ? `${r.ai.state} · ${r.speed.toFixed(1)} / ${r.ai.speedTarget.toFixed(1)} m/s · steer ${r.ai.steer.toFixed(2)} · lateral ${r.ai.lateral.toFixed(1)} -> ${r.ai.offset.toFixed(1)} · look ${r.ai.lookahead.toFixed(1)} m · plan ${r.ai.costMs.toFixed(3)} ms · recovery ${r.ai.stuck.toFixed(1)} s · resets ${r.resets}` : 'human'}\n`,
                )
                .join('')}
            {frame &&
              `Physics position ${vec(frame.body)}\nRendered position ${vec(frame.render)}\nCamera position ${vec(frame.camera)}\nCamera target ${vec(frame.target)}\nVehicle / camera frame Δ ${frame.vehicleDelta.toFixed(3)} / ${frame.cameraDelta.toFixed(3)} m\nCamera pose-input error ${frame.followError.toFixed(6)} m\n`}
            {`CHASSIS .84 × .34 × 1.70 half-extents · 850 kg\nCOM ${vec(d.centerOfMass)}\nGrounded ${d.grounded}\nLinear m/s ${vec(d.linear)}\nAngular rad/s ${vec(d.angular)}\nController Δv/dt ${d.controllerAcceleration.toFixed(2)} m/s²\nEngine ${d.engineForce.toFixed(0)} N · brake ${d.brakeForce.toFixed(0)} N\nSolver Δv ${vec(d.solverDelta)}\nForward loss ${d.forwardLoss.toFixed(3)} · peak ${d.peakForwardLoss.toFixed(3)} m/s\nContacts ${d.contacts.length} · sudden losses ${d.impacts.length}\n`}
            {d.contacts
              .map(
                (c, i) =>
                  `#${i} collider ${c.collider} normal ${vec(c.normal)}\n   impulse ${c.impulse.toFixed(1)} N·s · points ${c.points}\n`,
              )
              .join('')}
          </pre>
        </>
      )}
    </div>
  );
}
export function PhysicsCenterOfMass() {
  const ref = useRef<Mesh>(null);
  useFrame(() => {
    ref.current?.position.set(d.centerOfMass.x, d.centerOfMass.y, d.centerOfMass.z);
  });
  return (
    <mesh ref={ref} renderOrder={100}>
      <sphereGeometry args={[0.14, 8, 8]} />
      <meshBasicMaterial color="#ff00cc" depthTest={false} />
    </mesh>
  );
}
