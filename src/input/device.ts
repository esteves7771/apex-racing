import { useEffect, useState } from 'react';
export function touchDevice() {
  return (
    typeof window !== 'undefined' &&
    (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0)
  );
}
export function useTouchDevice() {
  const [touch, setTouch] = useState(touchDevice);
  useEffect(() => {
    const update = () => setTouch(touchDevice());
    const media = matchMedia('(pointer: coarse)');
    media.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return touch;
}
