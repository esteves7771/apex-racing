import { Canvas, useFrame } from '@react-three/fiber';
import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { CarVisual } from '../vehicle/CarVisual';
import { vehicles, getVehicle, vehiclePalette } from '../vehicle/VehicleRegistry';
import { useGame } from '../game/store';
function Showroom() {
  const ref = useRef<THREE.Group>(null),
    angle = useRef(0.5),
    drag = useRef<number | null>(null);
  const reduced = useGame((s) => s.save.settings.reducedMotion),
    selected = useGame((s) => s.save.settings.vehicle);
  useEffect(() => {
    ref.current?.scale.setScalar(0.86);
  }, [selected]);
  useFrame((_, dt) => {
    if (ref.current) {
      if (drag.current === null && !reduced) angle.current += dt * 0.18;
      ref.current.rotation.y = THREE.MathUtils.damp(ref.current.rotation.y, angle.current, 8, dt);
      ref.current.scale.setScalar(THREE.MathUtils.damp(ref.current.scale.x, 1, 8, dt));
    }
  });
  return (
    <>
      <color attach="background" args={['#dce9dc']} />
      <hemisphereLight intensity={3} args={['#fff4de', '#7b9d93', 3]} />
      <directionalLight position={[4, 7, 5]} intensity={3} />
      <mesh position={[0, -0.49, 0]}>
        <cylinderGeometry args={[3.2, 3.35, 0.3, 48]} />
        <meshStandardMaterial color="#abc4b8" roughness={0.8} />
      </mesh>
      <group
        ref={ref}
        onPointerDown={(e) => {
          drag.current = e.clientX;
          (e.target as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture(
            e.pointerId,
          );
        }}
        onPointerMove={(e) => {
          if (drag.current !== null) {
            angle.current += (e.clientX - drag.current) * 0.012;
            drag.current = e.clientX;
          }
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <CarVisual key={selected} preview />
      </group>
    </>
  );
}
export function Garage({ onConfirm }: { onConfirm: () => void }) {
  const { save, settings } = useGame(),
    car = getVehicle(save.settings.vehicle),
    color =
      save.settings.colors[car.id] ?? (car.id === 'sprinter' ? save.settings.color : car.color);
  return (
    <div className="garage-content">
      <div className="showroom" aria-label="3D vehicle preview · drag to rotate">
        <Canvas camera={{ position: [4, 2.5, -4.8], fov: 36 }} dpr={[1, 1.3]}>
          <Showroom />
        </Canvas>
      </div>
      <div className="vehicle-tabs">
        {vehicles.map((v) => (
          <button
            key={v.id}
            aria-pressed={car.id === v.id}
            onClick={() => settings({ vehicle: v.id })}
          >
            {v.name.split(' ')[1]}
          </button>
        ))}
      </div>
      <h3>{car.name}</h3>
      <small>
        {car.difficulty} · {Math.round(car.handling.maxSpeed * 3.6)} km/h · {car.mass} kg
      </small>
      <p>{car.description}</p>
      <div className="performance-bars">
        {['Top speed', 'Acceleration', 'Corner grip', 'Braking'].map((label, i) => (
          <label key={label}>
            {label}
            <meter min="0" max="100" value={car.stats[i]} />
          </label>
        ))}
      </div>
      <div className="swatches">
        {vehiclePalette.map((c, i) => (
          <button
            key={c}
            aria-label={
              [
                'Sunflower yellow',
                'Sunset coral',
                'Glacier teal',
                'Cobalt blue',
                'Rally yellow',
                'Ivory',
              ][i]
            }
            aria-pressed={color === c}
            style={{ background: c }}
            onClick={() =>
              settings({
                color: car.id === 'sprinter' ? c : save.settings.color,
                colors: { ...save.settings.colors, [car.id]: c },
              })
            }
          >
            {color === c ? '✓' : ''}
          </button>
        ))}
      </div>
      <small>Selected for all modes · saved locally. Drag the model to rotate.</small>
      <button className="secondary" onClick={onConfirm}>
        Use {car.name.split(' ')[1]} →
      </button>
    </div>
  );
}
