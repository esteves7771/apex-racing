import { useMemo, useEffect } from 'react';
import { ArtBuilder } from '../track/ArtAssets';
import type { VehicleId } from './VehicleRegistry';
/** One owned mesh per car for small panel, intake and lamp trim details. */
export function VehicleTrim({ id }: { id: VehicleId }) {
  const geometry = useMemo(() => {
    const b = new ArtBuilder(),
      length = id === 'bolt' ? 1.58 : id === 'vortex' ? 1.78 : 1.85,
      width = id === 'vortex' ? 0.94 : 0.87;
    b.box([0, 0.38, -length - 0.025], [0.84, 0.15, 0.045], '#203e42');
    for (let i = 0; i < 6; i++)
      b.box([-0.34 + i * 0.135, 0.38, -length - 0.055], [0.025, 0.12, 0.025], '#77988e');
    for (const side of [-1, 1]) {
      b.box([side * width, 0.64, 0.02], [0.025, 0.33, 0.025], '#31514c');
      b.box([side * (width + 0.012), 0.77, 0.23], [0.035, 0.035, 0.2], '#e5d8ac');
      b.box([side * width, 0.25, 0], [0.07, 0.08, length * 1.4], '#2a4547');
      b.box([side * 0.56, 0.46, -length - 0.02], [0.3, 0.035, 0.05], '#fff0c1');
    }
    if (id === 'vortex')
      for (const side of [-1, 1])
        for (let j = 0; j < 3; j++)
          b.box([side * 0.93, 0.43, 0.65 + j * 0.13], [0.035, 0.13, 0.065], '#24424b');
    if (id === 'bolt') b.box([0, 1.34, 0.25], [0.6, 0.035, 0.8], '#293f41');
    b.box([0, 0.28, length + 0.035], [0.54, 0.1, 0.035], '#d8ddcd');
    return b.finish();
  }, [id]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} name="vehicle-panel-details">
      <meshStandardMaterial vertexColors roughness={0.55} metalness={0.18} />
    </mesh>
  );
}
