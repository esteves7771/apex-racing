import { vehicleConfig, type VehicleConfig } from './VehicleConfig';
export type VehicleId = 'sprinter' | 'vortex' | 'bolt';
export interface VehicleDefinition {
  id: VehicleId;
  name: string;
  description: string;
  difficulty: string;
  color: string;
  handling: VehicleConfig;
  response: number;
  airControl: number;
  mass: number;
  engine: { base: number; multiplier: number };
  stats: [number, number, number, number];
}
export const vehicles: VehicleDefinition[] = [
  {
    id: 'sprinter',
    name: 'APEX-01 Sprinter',
    description:
      'The familiar all-rounder. Predictable grip, forgiving brakes, and a balanced drift.',
    difficulty: 'Easy · balanced',
    color: '#f6d35e',
    handling: vehicleConfig,
    response: 0.22,
    airControl: 0.012,
    mass: 850,
    engine: { base: 35, multiplier: 3.2 },
    stats: [60, 65, 75, 75],
  },
  {
    id: 'vortex',
    name: 'APEX-02 Vortex',
    description: 'A low, wide high-speed wedge. Plan your braking and commit to a wider line.',
    difficulty: 'Expert · high speed',
    color: '#4d79e7',
    handling: {
      maxSpeed: 61.1,
      reverseSpeed: 9,
      acceleration: 21,
      braking: 19,
      grip: 5.8,
      driftGrip: 1.9,
      steering: 1.36,
      drag: 0.19,
      torqueFloor: 0.28,
      steeringFalloff: 0.59,
    },
    response: 0.12,
    airControl: 0.007,
    mass: 1000,
    engine: { base: 46, multiplier: 3.7 },
    stats: [100, 78, 46, 48],
  },
  {
    id: 'bolt',
    name: 'APEX-03 Bolt',
    description:
      'A compact rally hatch. Punchy starts, quick direction changes, and easy drift recovery.',
    difficulty: 'Medium · agile',
    color: '#ffe154',
    handling: {
      maxSpeed: 48.6,
      reverseSpeed: 10,
      acceleration: 23,
      braking: 32,
      grip: 11.5,
      driftGrip: 4.2,
      steering: 1.98,
      drag: 0.27,
      torqueFloor: 0.16,
      steeringFalloff: 0.5,
    },
    response: 0.32,
    airControl: 0.016,
    mass: 780,
    engine: { base: 31, multiplier: 3.5 },
    stats: [77, 95, 94, 96],
  },
];
export const getVehicle = (id: unknown) => vehicles.find((v) => v.id === id) ?? vehicles[0];
export const vehiclePalette = ['#f6d35e', '#f08062', '#60d8d4', '#4d79e7', '#ffe154', '#eee9d9'];
