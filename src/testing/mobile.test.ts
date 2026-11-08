import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TouchInput } from '../input/TouchInput';
import { initialAutoPreset, needsLowerQuality, lowerPreset } from '../render/GraphicsQuality';
import { shaderSnapshot } from '../render/ShaderWarmup';
import { WedgeGeometry } from '../vehicle/VehicleBodies';
import { readSave, defaults } from '../persistence/storage';
describe('v0.6 touch and quality', () => {
  it('holds simultaneous throttle/steering/brake and releases only its own pointer', () => {
    const t = new TouchInput();
    t.press(1, 'throttle');
    t.press(2, 'left');
    t.press(3, 'brake');
    for (let i = 0; i < 30; i++) t.sample();
    expect(t.sample()).toMatchObject({ throttle: true, brake: true });
    expect(t.sample().steer).toBeGreaterThan(0.9);
    t.release(1);
    expect(t.sample()).toMatchObject({ throttle: false, brake: true });
    t.release(2);
    expect(t.pointers.size).toBe(1);
  });
  it('does not clear a duplicated action until every owning finger releases; cancellation clears residual steering', () => {
    const t = new TouchInput();
    t.press(1, 'throttle');
    t.press(2, 'throttle');
    t.release(1);
    expect(t.sample().throttle).toBe(true);
    t.press(3, 'left');
    t.sample();
    t.clear();
    expect(t.sample()).toEqual({ throttle: false, brake: false, steer: 0, drift: false });
  });
  it('bounds touch steering sensitivity without changing the physics command contract', () => {
    const t = new TouchInput();
    t.press(1, 'right');
    for (let i = 0; i < 100; i++) t.sample(1 / 60, 1.5);
    expect(t.sample().steer).toBeGreaterThanOrEqual(-1);
    const slow = new TouchInput(),
      fast = new TouchInput();
    slow.press(1, 'left');
    fast.press(1, 'left');
    expect(fast.sample(1 / 60, 1.5).steer).toBeGreaterThan(slow.sample(1 / 60, 0.5).steer);
    for (let i = 0; i < 120; i++) slow.sample(1 / 60, 0.5);
    expect(slow.sample(1 / 60, 0.5).steer).toBeGreaterThan(0.99);
  });
  it('chooses conservative capability presets and lowers only on a sustained warm sample', () => {
    expect(initialAutoPreset(true, 844, 8, 4)).toBe('low');
    expect(initialAutoPreset(false, 1366, 16, 8)).toBe('high');
    expect(initialAutoPreset(true, 1024, 8, 8)).toBe('medium');
    expect(needsLowerQuality(Array(300).fill(16.7))).toBe(false);
    expect(needsLowerQuality(Array(300).fill(35))).toBe(true);
    expect(needsLowerQuality([100])).toBe(false);
    expect(lowerPreset('low')).toBe('low');
  });
  it('persists new settings while retaining old quality selections and records', () => {
    for (const quality of ['auto', 'low', 'medium', 'high']) {
      const save = {
        ...structuredClone(defaults),
        settings: { ...defaults.settings, quality, steeringSensitivity: 1.2 },
      };
      const restored = readSave({ getItem: () => JSON.stringify(save) });
      expect(restored.settings.quality).toBe(quality);
      expect(restored.settings.steeringSensitivity).toBe(1.2);
    }
  });
});
it('owns each vehicle geometry independently and releases temporary shader materials without disposing live resources', () => {
  const a = new WedgeGeometry(),
    b = new WedgeGeometry();
  let liveDisposed = 0,
    ownedDisposed = 0;
  const material = new THREE.MeshStandardMaterial();
  material.onBeforeCompile = () => {};
  material.addEventListener('dispose', () => liveDisposed++);
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(a, material), new THREE.Mesh(b, material));
  const snapshot = shaderSnapshot(scene),
    meshes = snapshot.scene.children as THREE.Mesh[];
  expect(meshes[0].material).not.toBe(material);
  expect(meshes[0].material).toBe(meshes[1].material);
  expect((meshes[0].material as THREE.Material).onBeforeCompile).toBe(material.onBeforeCompile);
  (meshes[0].material as THREE.Material).addEventListener('dispose', () => ownedDisposed++);
  snapshot.dispose();
  snapshot.dispose();
  expect(ownedDisposed).toBe(1);
  expect(liveDisposed).toBe(0);
  expect(b.getAttribute('position').count).toBeGreaterThan(0);
  a.dispose();
  b.dispose();
  material.dispose();
});
