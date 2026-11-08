import { Vector3, Quaternion, type Object3D } from 'three';

export class RingBuffer<T> {
  private slots: T[];
  private cursor = 0;
  private count = 0;
  constructor(
    readonly capacity: number,
    factory: () => T,
  ) {
    if (capacity < 1) throw Error('capacity');
    this.slots = Array.from({ length: capacity }, factory);
  }
  next() {
    const slot = this.slots[this.cursor];
    this.cursor = (this.cursor + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);
    return slot;
  }
  values() {
    return Array.from(
      { length: this.count },
      (_, i) => this.slots[(this.cursor - this.count + i + this.capacity) % this.capacity],
    );
  }
  clear() {
    this.cursor = 0;
    this.count = 0;
  }
  latest() {
    return this.count ? this.slots[(this.cursor - 1 + this.capacity) % this.capacity] : undefined;
  }
}
export function frameStatistics(times: number[]) {
  const sorted = [...times].sort((a, b) => a - b),
    n = times.length,
    average = n ? times.reduce((a, b) => a + b, 0) / n : 0;
  return {
    fps: average ? 1000 / average : 0,
    average,
    p95: n ? sorted[Math.ceil(n * 0.95) - 1] : 0,
    p99: n ? sorted[Math.ceil(n * 0.99) - 1] : 0,
  };
}
const vector = () => ({ x: 0, y: 0, z: 0 });
export const performanceDiagnostics = {
  enabled: false,
  cameraDisabled: false,
  minimalEnvironment: false,
  visual: null as Object3D | null,
  scheduler: null as {
    advance: (timestamp: number, effects?: boolean) => void;
    setFrameloop: (mode: 'always' | 'never') => void;
    elapsed: () => number;
  } | null,
  followPosition: new Vector3(),
  cameraTarget: new Vector3(),
  bodyPosition: new Vector3(),
  velocity: new Vector3(),
  acceleration: new Vector3(),
  rotation: new Quaternion(),
  angular: new Vector3(),
  grounded: false,
  stepsThisFrame: 0,
  stepMs: 0,
  stepStart: 0,
  physicsTicks: 0,
  frameStart: 0,
  frameDelta: 0,
  summary: {
    fps: 0,
    average: 0,
    p95: 0,
    p99: 0,
    physicsHz: 0,
    physicsMs: 0,
    frameMs: 0,
    steps: 0,
    calls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
  },
  frames: new RingBuffer(600, () => ({
    frameMs: 0,
    dt: 0,
    physicsSteps: 0,
    physicsMs: 0,
    body: vector(),
    render: vector(),
    follow: vector(),
    camera: vector(),
    target: vector(),
    velocity: vector(),
    acceleration: vector(),
    bodyRotation: { x: 0, y: 0, z: 0, w: 1 },
    renderRotation: { x: 0, y: 0, z: 0, w: 1 },
    angular: vector(),
    grounded: false,
    vehicleDelta: 0,
    cameraDelta: 0,
    followError: 0,
    calls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
  })),
  physics: new RingBuffer(1200, () => ({
    tick: 0,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    stepMs: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    wy: 0,
    grounded: false,
  })),
  reset() {
    this.frames.clear();
    this.physics.clear();
    this.physicsTicks = 0;
    this.stepsThisFrame = 0;
  },
  snapshot() {
    return {
      summary: { ...this.summary },
      frames: structuredClone(this.frames.values()),
      physics: structuredClone(this.physics.values()),
    };
  },
};
export function recordPhysicsStep(
  p: { x: number; y: number; z: number },
  v: { x: number; y: number; z: number },
  rotation = { x: 0, y: 0, z: 0, w: 1 },
  angular = { x: 0, y: 0, z: 0 },
  grounded = false,
) {
  const d = performanceDiagnostics;
  d.stepsThisFrame++;
  d.physicsTicks++;
  const ms = performance.now() - d.stepStart;
  d.stepMs += ms;
  d.bodyPosition.copy(p);
  d.acceleration.copy(v).sub(d.velocity).multiplyScalar(60);
  d.velocity.copy(v);
  d.rotation.copy(rotation);
  d.angular.copy(angular);
  d.grounded = grounded;
  const s = d.physics.next();
  s.tick = d.physicsTicks;
  s.x = p.x;
  s.y = p.y;
  s.z = p.z;
  s.vx = v.x;
  s.vy = v.y;
  s.vz = v.z;
  s.stepMs = ms;
  s.qx = rotation.x;
  s.qy = rotation.y;
  s.qz = rotation.z;
  s.qw = rotation.w;
  s.wy = angular.y;
  s.grounded = grounded;
}
