import { useEffect } from 'react';

// An on-screen keyboard either overlays the page (iOS: the visual viewport shrinks, the layout
// viewport does not) or resizes it (Android). Either way the page is told through
// `data-keyboard="open"` on <html> and `--keyboard-inset`, the height the keyboard covers.
const OPEN_THRESHOLD = 120;

export function keyboardState(layoutHeight: number, baseline: number, vv: { height: number; offsetTop: number }) {
  const inset = Math.max(0, Math.round(layoutHeight - vv.height - vv.offsetTop));
  const shrunk = baseline - vv.height;
  return { inset, open: inset > OPEN_THRESHOLD || shrunk > OPEN_THRESHOLD * 1.5 };
}

export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let baseline = window.innerHeight;
    const update = () => {
      // Only a focused text field can have raised a keyboard; anything else is a browser bar or zoom.
      const el = document.activeElement as HTMLElement | null;
      const editing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      if (!editing) baseline = Math.max(window.innerHeight, vv.height);
      const { inset, open } = keyboardState(window.innerHeight, baseline, vv);
      const isOpen = editing && open;
      root.style.setProperty('--keyboard-inset', `${isOpen ? inset : 0}px`);
      root.dataset.keyboard = isOpen ? 'open' : 'closed';
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('focusin', update);
    window.addEventListener('focusout', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('focusin', update);
      window.removeEventListener('focusout', update);
      delete root.dataset.keyboard;
      root.style.removeProperty('--keyboard-inset');
    };
  }, []);
}
