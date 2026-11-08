// Negative priorities order callbacks without taking over R3F's automatic render.
export const FRAME_ORDER = { physics: -100, vehiclePose: -50, camera: -40, lighting: -30 } as const;
