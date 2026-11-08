import { useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGame } from '../game/store';
export function WindMaterial({
  color,
  flag = false,
  doubleSide = false,
}: {
  color: string;
  flag?: boolean;
  doubleSide?: boolean;
}) {
  const reduced = useGame(
    (s) => s.save.settings.reducedMotion || s.save.settings.effects === 'low',
  );
  const { material, time } = useMemo(() => {
    const time = { value: 0 },
      material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.85,
        flatShading: true,
        side: flag || doubleSide ? THREE.DoubleSide : THREE.FrontSide,
      });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.apexWind = time;
      shader.vertexShader = 'uniform float apexWind;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      float phase = modelMatrix[3].x * 0.11 + modelMatrix[3].z * 0.07;
      #ifdef USE_INSTANCING
      phase += instanceMatrix[3].x * 0.11 + instanceMatrix[3].z * 0.07;
      #endif
      transformed.${flag ? 'z' : 'x'} += sin(apexWind * ${flag ? '2.5' : '1.2'} + phase + position.y * 2.0) * ${flag ? '0.18 * (position.x + 0.7)' : '0.045 * max(0.0, position.y + 0.8)'};
    `,
      );
    };
    material.customProgramCacheKey = () => (flag ? 'apex-flag-1' : 'apex-wind-1');
    return { material, time };
  }, [color, flag, doubleSide]);
  useFrame(({ clock }) => {
    time.value = reduced ? 0 : clock.elapsedTime;
  });
  useEffect(() => () => material.dispose(), [material]);
  return <primitive object={material} attach="material" />;
}
