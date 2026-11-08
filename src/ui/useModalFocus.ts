import { useEffect, useRef } from 'react';
/** Trap keyboard navigation only while a menu dialog is open; restore the triggering control. */
export function useModalFocus(active: boolean, close: () => void) {
  const action = useRef(close);
  action.current = close;
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].at(-1);
    if (!dialog) return;
    const controls = () =>
      [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled),select:not(:disabled),input:not(:disabled),[tabindex="0"]',
        ),
      ].filter((e) => e.getClientRects().length);
    controls()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        action.current();
      }
      if (e.code === 'Tab') {
        const items = controls(),
          index = items.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey ? index <= 0 : index === items.length - 1) {
          e.preventDefault();
          (e.shiftKey ? items.at(-1) : items[0])?.focus();
        }
      }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [active]);
}
