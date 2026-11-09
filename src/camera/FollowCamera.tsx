import { speedFov } from './speedFeedback';
import { menuPose } from '../render/MenuStage';
import { useTouchDevice } from '../input/device';
import { trackId, coast, canyon, nearestTrack } from '../track/ActiveTrack';
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
      const pose = menuPose(),
        sway = settings.reducedMotion ? 0 : Math.sin(time.current * 0.08) * 0.7;
      desiredPosition
        .copy(pose.p)
        .add(
          new THREE.Vector3(
            Math.cos(pose.yaw) * 9 + Math.sin(pose.yaw) * 17,
            8.5,
            -Math.sin(pose.yaw) * 9 + Math.cos(pose.yaw) * 17,
          ),
        );
      desiredPosition.x += sway;
      targetPosition
        .copy(pose.p)
        .add(new THREE.Vector3(-Math.sin(pose.yaw) * 8, 1.3, -Math.cos(pose.yaw) * 8));
    } else {
      const eagle = telemetry.camera === 1,
        speed = settings.reducedMotion ? 0 : Math.min(1, Math.abs(telemetry.speed) / 42);
      desiredPosition.copy(carPosition).addScaledVector(carForward, -(eagle ? 13 : 10 + speed * 3));
      desiredPosition.y += eagle ? 29 : 7.5 + speed * 2;
      targetPosition.copy(carPosition).addScaledVector(carForward, eagle ? 6 : 7 + speed * 4);
      targetPosition.y += 0.5;
    }
    if (trackId === 'coast' || trackId === 'canyon') {
      const n =
          trackId === 'canyon'
            ? canyon.projectRoute(carPosition.x, carPosition.z, undefined, telemetry.courseRoute)
            : nearestTrack(carPosition.x, carPosition.z),
        tunnel =
          trackId === 'canyon'
            ? canyon.tunnelAt(n.t, (n as unknown as { route: string }).route)
            : coast.tunnelAt(n.t, 0.005);
      if (tunnel && !menu) {
        desiredPosition.copy(carPosition).addScaledVector(carForward, -5);
        desiredPosition.y = Math.min(
          carPosition.y + 2.6,
          (trackId === 'canyon'
            ? canyon.routePose(n.t, (n as unknown as { route: string }).route).p.y
            : coast.roadHeight(n.t)) +
            tunnel.height -
            1.4,
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
          speedFov(telemetry.speed, settings.reducedMotion, menu, telemetry.camera),
        3,
        dt,
      );
      camera.updateProjectionMatrix();
    }
  }, FRAME_ORDER.camera);
  return null;
}
