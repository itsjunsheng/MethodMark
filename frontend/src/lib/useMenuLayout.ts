import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

// Keep inline menus inside their visible scroll container so opening them cannot
// enlarge the form. The menu owns any scrolling needed for its options.
export function useMenuLayout(open: boolean, root: RefObject<HTMLElement | null>, maxHeight = 260) {
  const [layout, setLayout] = useState({ maxHeight, above: false });

  useLayoutEffect(() => {
    if (!open) return;
    const field = root.current;
    const container = field?.closest('.builder-content, .modal');
    if (!field || !container) return;
    const position = () => {
      const bounds = field.getBoundingClientRect();
      const viewport = container.getBoundingClientRect();
      const below = Math.min(viewport.bottom, window.innerHeight) - bounds.bottom - 12;
      const above = bounds.top - Math.max(viewport.top, 0) - 12;
      const openAbove = below < 160 && above > below;
      setLayout({ maxHeight: Math.max(0, Math.min(maxHeight, openAbove ? above : below)), above: openAbove });
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(container);
    observer.observe(field);
    window.addEventListener('resize', position);
    container.addEventListener('scroll', position, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
      container.removeEventListener('scroll', position);
    };
  }, [open, root, maxHeight]);

  return layout;
}
