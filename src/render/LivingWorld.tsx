import { WindMaterial } from '../track/WindMaterial';
export function LivingWorld() {
  return (
    <>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 10, 0, 112]}>
          <mesh position={[0, 2.1, 0]}>
            <boxGeometry args={[0.12, 4.2, 0.12]} />
            <meshStandardMaterial color="#e9e5cf" />
          </mesh>
          <mesh position={[0.7, 3.4, 0]}>
            <planeGeometry args={[1.4, 1.1, 10, 4]} />
            <WindMaterial color={s > 0 ? '#f08062' : '#60d8d4'} flag />
          </mesh>
        </group>
      ))}
    </>
  );
}
