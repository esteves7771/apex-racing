import { WorldLife } from './WorldLife';
import { Atmosphere } from './Atmosphere';
import { MenuStage, menuPose } from './MenuStage';
import { VehiclePortraitCapture } from '../ui/VehiclePortrait';
import { touchDevice } from '../input/device';
import {
  graphicsPresets,
  initialAutoPreset,
  lowerPreset,
  needsLowerQuality,
  type GraphicsPreset,
} from './GraphicsQuality';
import { trackId } from '../track/ActiveTrack';
import { CoastWorld } from '../track/CoastWorld';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { TrackMesh } from '../track/TrackMesh';
import { ArcadeVehicleController } from '../vehicle/ArcadeVehicleController';
import { FollowCamera } from '../camera/FollowCamera';
import { race, telemetry, useGame } from '../game/store';
import { carPosition } from '../vehicle/ArcadeVehicleController';
import { surfaceAt } from '../track/ActiveTrack';
import { DrivingEffects } from './DrivingEffects';
import { usePhysicsDebug } from '../vehicle/physicsDiagnostics';
import { PhysicsCenterOfMass } from '../ui/PhysicsDebug';
import { FrameObserver } from './FrameObserver';
import { FRAME_ORDER } from './frameOrder';
import { Obstacles } from './Obstacles';
import { LivingWorld } from './LivingWorld';
import { AIOpponents } from '../ai/AIOpponents';
import { AIDiagnostics } from '../ai/AIDiagnostics';
function Sun({ size }: { size: number }) {
  const ref = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const shadow = ref.current?.shadow;
    if (shadow) {
      shadow.map?.dispose();
      shadow.map = null;
      shadow.needsUpdate = true;
    }
  }, [size]);
  useFrame(() => {
    if (ref.current) {
      const center = ['MENU','MODE_SELECT'].includes(race.phase) ? menuPose().p : carPosition;
      ref.current.position.copy(center).add(new THREE.Vector3(35,55,25));
      ref.current.target.position.copy(['MENU','MODE_SELECT'].includes(race.phase) ? menuPose().p : carPosition);
      ref.current.target.updateMatrixWorld();
    }
  }, FRAME_ORDER.lighting);
  return (
    <directionalLight
      ref={ref}
      intensity={3.25}
      color="#fff0d0"
      castShadow
      position={[35, 55, 25]}
      shadow-mapSize={[size, size]}
      shadow-camera-left={-55}
      shadow-camera-right={55}
      shadow-camera-top={55}
      shadow-camera-bottom={-55}
      shadow-camera-far={160}
      shadow-bias={-0.0003}
    />
  );
}
function Skids() {
  const ref = useRef<THREE.InstancedMesh>(null),
    clock = useRef(0),
    index = useRef(0),
    obj = useRef(new THREE.Object3D());
  useEffect(() => {
    if (ref.current) {
      obj.current.scale.setScalar(0);
      obj.current.updateMatrix();
      for (let i = 0; i < 360; i++) ref.current.setMatrixAt(i, obj.current.matrix);
      ref.current.instanceMatrix.needsUpdate = true;
    }
  }, []);
  useFrame((_, dt) => {
    clock.current += dt;
    if (clock.current < 0.045 || !telemetry.drift) return;
    clock.current = 0;
    if (!ref.current) return;
    for (const side of [-1, 1]) {
      const o = obj.current;
      o.position.set(
        telemetry.x + Math.cos(telemetry.yaw) * side * 0.8,
        surfaceAt(telemetry.x, telemetry.z).height + 0.025,
        telemetry.z - Math.sin(telemetry.yaw) * side * 0.8,
      );
      o.rotation.set(-Math.PI / 2, 0, telemetry.yaw);
      o.scale.set(0.18, 0.7, 1);
      o.updateMatrix();
      ref.current.setMatrixAt(index.current++ % 360, o.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 360]} frustumCulled={false}>
      <planeGeometry />
      <meshBasicMaterial color="#1f2930" transparent opacity={0.32} depthWrite={false} />
    </instancedMesh>
  );
}
export function Scene({ onReady }: { onReady: () => void }) {
  const selectedTrack = useGame((s) => s.save.settings.track);
  const quality = useGame((s) => s.save.settings.quality);
  const [auto, setAuto] = useState<GraphicsPreset>(() =>
    initialAutoPreset(
      touchDevice(),
      window.innerWidth,
      navigator.hardwareConcurrency,
      (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    ),
  );
  const preset = quality === 'auto' ? auto : quality,
    graphics = graphicsPresets[preset];
  const paused = useGame(() => race.phase === 'PAUSED');
  const debug = usePhysicsDebug((s) => import.meta.env.DEV && s.enabled && s.wireframes);
  return (
    <Canvas
      shadows={graphics.shadows}
      dpr={[1, graphics.dpr]}
      camera={{ position: [12, 10, 120], fov: 48, near: 0.1, far: 1300 }}
      gl={{ antialias: !touchDevice() && quality !== 'low', powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
      fallback={
        <div className="error">
          WebGL2 is unavailable. Enable hardware acceleration, then reload.
        </div>
      }
    >
      <color attach="background" args={[trackId === 'pine' ? '#b7dace' : '#b6e4e0']} />
      <fog attach="fog" args={[trackId==='pine'?'#b8cfc0':'#a6d4cf', 220, 1100]} />
      <hemisphereLight args={['#e2eddd', '#506f58', 1.6]} />
      <Sun size={graphics.shadowSize} />
      <Atmosphere track={selectedTrack} />
      <WorldLife track={selectedTrack} />
      <GraphicsMonitor enabled={quality === 'auto'} lower={() => setAuto((p) => lowerPreset(p))} />
      <Suspense fallback={null}>
        <Physics
          key={`physics-${selectedTrack}`}
          timeStep={1 / 60}
          interpolate
          paused={paused}
          debug={debug}
          updatePriority={FRAME_ORDER.physics}
        >
          <Ready onReady={onReady} />
          {trackId === 'pine' ? <TrackMesh preset={preset} /> : <CoastWorld qualityKey={preset} />}
          <ArcadeVehicleController />
          <AIOpponents />
          {trackId === 'pine' && <Obstacles />}
          {debug && <PhysicsCenterOfMass />}
        </Physics>
        <Skids key={`skids-${selectedTrack}`} />
        <DrivingEffects density={graphics.effects} key={`effects-${selectedTrack}`} />
        {trackId === 'pine' && <LivingWorld />}
        {import.meta.env.DEV && <AIDiagnostics key={`ai-lines-${selectedTrack}`} />}
      </Suspense>
      <MenuStage />
      <VehiclePortraitCapture />
      <FollowCamera key={`camera-${selectedTrack}`} />
      {import.meta.env.DEV && <FrameObserver />}
    </Canvas>
  );
}
function Ready({ onReady }: { onReady: () => void }) {
  useEffect(onReady, [onReady]);
  return null;
}

function GraphicsMonitor({ enabled, lower }: { enabled: boolean; lower: () => void }) {
  const sample = useRef<number[]>([]),
    elapsed = useRef(0),
    cooldown = useRef(0);
  useFrame((_, dt) => {
    elapsed.current += dt;
    cooldown.current -= dt;
    if (!enabled || elapsed.current < 8 || dt > 0.1) return;
    sample.current.push(dt * 1000);
    if (sample.current.length > 300) sample.current.shift();
    if (race.phase === 'MENU' && cooldown.current <= 0 && needsLowerQuality(sample.current)) {
      lower();
      sample.current = [];
      cooldown.current = 30;
    }
  });
  return null;
}
