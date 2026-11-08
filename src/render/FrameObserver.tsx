import { useEffect, useRef } from 'react';
import { addAfterEffect, useFrame, useThree } from '@react-three/fiber';
import { Mesh, Vector3, Quaternion } from 'three';
import { performanceDiagnostics as d, frameStatistics } from './frameDiagnostics';
import { usePhysicsDebug } from '../vehicle/physicsDiagnostics';

export function FrameObserver() {
  const { gl, camera, scene, advance, setFrameloop, clock } = useThree(),
    last = useRef(0),
    lastSummary = useRef(0),
    previousRender = useRef(new Vector3()),
    previousCamera = useRef(new Vector3()),
    hidden = useRef(new Map<Mesh, boolean>());
  const orientation = useRef(new Quaternion());
  useEffect(() => {
    d.scheduler = { advance, setFrameloop, elapsed: () => clock.elapsedTime };
    return () => {
      d.scheduler = null;
      hidden.current.forEach((visible, o) => (o.visible = visible));
      hidden.current.clear();
    };
  }, [advance, setFrameloop, clock]);
  useFrame((_, dt) => {
    if (!d.enabled && !usePhysicsDebug.getState().enabled) {
      hidden.current.forEach((visible, o) => (o.visible = visible));
      hidden.current.clear();
      last.current = 0;
      return;
    }
    d.stepsThisFrame = 0;
    d.stepMs = 0;
    d.frameStart = performance.now();
    d.frameDelta = dt;
    if (d.minimalEnvironment && !hidden.current.size) {
      scene.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        let p = o as typeof o | null;
        while (p && p !== d.visual) p = p.parent as typeof o | null;
        if (p) return;
        hidden.current.set(o, o.visible);
        o.visible = false;
      });
    } else if (!d.minimalEnvironment && hidden.current.size) {
      hidden.current.forEach((visible, o) => (o.visible = visible));
      hidden.current.clear();
    }
  }, -1000);
  useEffect(
    () =>
      addAfterEffect(() => {
        if ((!d.enabled && !usePhysicsDebug.getState().enabled) || !d.visual) return;
        const now = performance.now(),
          s = d.frames.next(),
          e = d.visual.matrixWorld.elements;
        s.frameMs = last.current ? now - last.current : d.frameDelta * 1000;
        last.current = now;
        s.dt = d.frameDelta;
        s.physicsSteps = d.stepsThisFrame;
        s.physicsMs = d.stepMs;
        Object.assign(s.body, d.bodyPosition);
        s.render.x = e[12];
        s.render.y = e[13];
        s.render.z = e[14];
        Object.assign(s.follow, d.followPosition);
        Object.assign(s.camera, camera.position);
        Object.assign(s.target, d.cameraTarget);
        Object.assign(s.velocity, d.velocity);
        Object.assign(s.acceleration, d.acceleration);
        Object.assign(s.bodyRotation, d.rotation);
        orientation.current.setFromRotationMatrix(d.visual.matrixWorld);
        Object.assign(s.renderRotation, orientation.current);
        Object.assign(s.angular, d.angular);
        s.grounded = d.grounded;
        s.vehicleDelta = previousRender.current.distanceTo(s.render);
        s.cameraDelta = previousCamera.current.distanceTo(s.camera);
        s.followError = d.followPosition.distanceTo(s.render);
        previousRender.current.copy(s.render);
        previousCamera.current.copy(s.camera);
        s.calls = gl.info.render.calls;
        s.triangles = gl.info.render.triangles;
        s.geometries = gl.info.memory.geometries;
        s.textures = gl.info.memory.textures;
        if (now - lastSummary.current > 250) {
          lastSummary.current = now;
          const frames = d.frames.values(),
            stats = frameStatistics(frames.map((f) => f.frameMs)),
            seconds = frames.reduce((a, f) => a + f.dt, 0);
          Object.assign(d.summary, stats, {
            physicsHz: seconds ? frames.reduce((a, f) => a + f.physicsSteps, 0) / seconds : 0,
            physicsMs: s.physicsMs,
            frameMs: s.frameMs,
            steps: s.physicsSteps,
            calls: s.calls,
            triangles: s.triangles,
            geometries: s.geometries,
            textures: s.textures,
          });
        }
      }),
    [gl, camera],
  );
  return null;
}
