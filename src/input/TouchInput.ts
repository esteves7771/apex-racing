export type DriveAction = 'throttle' | 'brake' | 'left' | 'right' | 'drift';
/** Pointer ownership prevents releasing one finger from clearing another held control. */
export class TouchInput {
  pointers = new Map<number, DriveAction>();
  steering = 0;
  press(pointer: number, action: DriveAction) {
    this.pointers.set(pointer, action);
  }
  release(pointer: number) {
    this.pointers.delete(pointer);
  }
  clear() {
    this.pointers.clear();
    this.steering = 0;
  }
  sample(dt = 1 / 60, sensitivity = 1) {
    const held = new Set(this.pointers.values());
    const target = Number(held.has('left')) - Number(held.has('right'));
    const response = 14 * Math.max(0.5, Math.min(1.5, sensitivity));
    const blend = 1 - Math.exp(-Math.max(0, Math.min(dt, 0.1)) * response);
    this.steering += (target - this.steering) * blend;
    if (Math.abs(this.steering) < 0.001) this.steering = 0;
    return {
      throttle: held.has('throttle'),
      brake: held.has('brake'),
      steer: this.steering,
      drift: held.has('drift'),
    };
  }
}
export const touchInput = new TouchInput();
