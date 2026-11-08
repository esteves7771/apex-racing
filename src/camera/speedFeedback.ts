import { MathUtils } from 'three';
export function speedFov(speed: number, reduced: boolean, menu: boolean, camera: number) {
  return reduced || menu || camera === 1 ? 0 : 10 * MathUtils.smoothstep(Math.abs(speed), 12, 48);
}
