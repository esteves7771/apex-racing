import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { CarVisual } from '../vehicle/CarVisual';
import { useGame } from '../game/store';

let portrait = '';
const listeners = new Set<() => void>();
export function VehiclePortrait() {
  const src = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => portrait,
  );
  return src ? (
    <img className="car-portrait" src={src} alt="Selected vehicle rendered in 3D" />
  ) : (
    <span className="portrait-loading">Preparing vehicle…</span>
  );
}
/** One thumbnail render on selection, using the existing renderer; no second Canvas/context. */
export function VehiclePortraitCapture() {
  const settings = useGame((s) => s.save.settings);
  const { gl } = useThree();
  const scene = useMemo(() => new THREE.Scene(), []);
  const camera = useMemo(() => {
    const c = new THREE.PerspectiveCamera(32, 1.75, 0.1, 40);
    c.position.set(5, 3.1, -5.8);
    c.lookAt(0, 0.5, 0);
    return c;
  }, []);
  const target = useMemo(() => new THREE.WebGLRenderTarget(280, 160), []);
  const pending = useRef(2);
  useEffect(() => {
    pending.current = 2;
  }, [settings.vehicle, settings.color, settings.colors]);
  useEffect(() => () => target.dispose(), [target]);
  useFrame(() => {
    if (pending.current <= 0 || --pending.current > 0) return;
    const previous = gl.getRenderTarget(),
      alpha = gl.getClearAlpha(),
      color = gl.getClearColor(new THREE.Color());
    const auto = gl.shadowMap.autoUpdate;
    try {
      gl.shadowMap.autoUpdate = false;
      gl.setRenderTarget(target);
      gl.setClearColor(0x000000, 0);
      gl.clear();
      gl.render(scene, camera);
      const bytes = new Uint8Array(280 * 160 * 4);
      gl.readRenderTargetPixels(target, 0, 0, 280, 160, bytes);
      const canvas = document.createElement('canvas');
      canvas.width = 280;
      canvas.height = 160;
      const ctx = canvas.getContext('2d')!,
        image = ctx.createImageData(280, 160);
      for (let y = 0; y < 160; y++)
        image.data.set(bytes.subarray((159 - y) * 1120, (160 - y) * 1120), y * 1120);
      ctx.putImageData(image, 0, 0);
      portrait = canvas.toDataURL();
      listeners.forEach((fn) => fn());
    } finally {
      gl.setRenderTarget(previous);
      gl.setClearColor(color, alpha);
      gl.shadowMap.autoUpdate = auto;
    }
  });
  return createPortal(
    <>
      <hemisphereLight args={['#fff0d2', '#426966', 3]} />
      <directionalLight position={[3, 6, -4]} intensity={3} />
      <CarVisual key={settings.vehicle} preview />
    </>,
    scene,
  );
}
