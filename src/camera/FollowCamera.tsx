import { useTouchDevice } from '../input/device';
import { trackId, coast, nearestTrack } from '../track/ActiveTrack';
import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { carPosition, carForward } from '../vehicle/ArcadeVehicleController';
import { race, telemetry, useGame } from '../game/store';
import { performanceDiagnostics } from '../render/frameDiagnostics';
import { FRAME_ORDER } from '../render/frameOrder';
import { cameraBlend } from './smoothing';
import { usePhysicsDebug } from '../vehicle/physicsDiagnostics';
export function FollowCamera() {
  const touch = useTouchDevice();
  const { camera, size } = useThree(),
    look = useRef(new THREE.Vector3()),
    initialized = useRef(false),
    time = useRef(0),
    desired = useRef(new THREE.Vector3()),
    target = useRef(new THREE.Vector3());
  useFrame((_, dt) => {
    if (
      import.meta.env.DEV &&
      (performanceDiagnostics.enabled || usePhysicsDebug.getState().enabled) &&
      performanceDiagnostics.cameraDisabled
    )
      return;
    if (import.meta.env.DEV) performanceDiagnostics.followPosition.copy(carPosition);
    const settings = useGame.getState().save.settings;
    time.current += dt;
    const menu = ['MENU', 'MODE_SELECT'].includes(race.phase);
    const desiredPosition = desired.current,
      targetPosition = target.current;
    if (menu) {
      const a = time.current * 0.055;
      desiredPosition.set(12 * Math.cos(a) + 5, 8.8, 13 * Math.sin(a) + 12).add(carPosition);
      targetPosition.copy(carPosition);
      targetPosition.y += 0.6;
    } else {
      const eagle = telemetry.camera === 1,
        speed = settings.reducedMotion ? 0 : Math.min(1, Math.abs(telemetry.speed) / 42);
      desiredPosition.copy(carPosition).addScaledVector(carForward, -(eagle ? 13 : 10 + speed * 3));
      desiredPosition.y += eagle ? 29 : 7.5 + speed * 2;
      targetPosition.copy(carPosition).addScaledVector(carForward, eagle ? 6 : 7 + speed * 4);
      targetPosition.y += 0.5;
    }
    if (trackId === 'coast') {
      const n = nearestTrack(carPosition.x, carPosition.z),
        tunnel = coast.tunnelAt(n.t, 0.005);
      if (tunnel && !menu) {
        desiredPosition.copy(carPosition).addScaledVector(carForward, -5);
        desiredPosition.y = Math.min(
          carPosition.y + 2.6,
          coast.roadHeight(n.t) + tunnel.height - 1.4,
        );
        targetPosition.copy(carPosition).addScaledVector(carForward, 12);
        targetPosition.y += 0.65;
      }
    }
    // Camera stays above the 1.3m barriers; scenery is excluded from the road envelope.
    const blend = initialized.current ? cameraBlend(dt, settings.reducedMotion) : 1;
    camera.position.lerp(desiredPosition, blend);
    look.current.lerp(targetPosition, blend);
    camera.lookAt(look.current);
    if (import.meta.env.DEV) performanceDiagnostics.cameraTarget.copy(look.current);
    initialized.current = true;
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = THREE.MathUtils.damp(
        camera.fov,
        (touch && size.width / size.height < 1.8 ? 55 : 48) +
          (settings.reducedMotion ? 0 : Math.min(6, Math.abs(telemetry.speed) * 0.14)),
        3,
        dt,
      );
      camera.updateProjectionMatrix();
    }
  }, FRAME_ORDER.camera);
  return null;
}
