import { useEffect, useState } from 'react';

/** Tailwind defaults: md = 768px, lg = 1024px */
const MD_QUERY = '(min-width: 768px)';
const LG_QUERY = '(min-width: 1024px)';

export type LayoutTier = 'phone' | 'tablet' | 'desktop';

function readTier(): LayoutTier {
  if (typeof window === 'undefined') return 'desktop';
  if (window.matchMedia(LG_QUERY).matches) return 'desktop';
  if (window.matchMedia(MD_QUERY).matches) return 'tablet';
  return 'phone';
}

/** Phone (<md), tablet (md to lg), desktop (lg+). */
export function useBreakpoint(): {
  tier: LayoutTier;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isMobileShell: boolean;
} {
  const [tier, setTier] = useState<LayoutTier>(readTier);

  useEffect(() => {
    const md = window.matchMedia(MD_QUERY);
    const lg = window.matchMedia(LG_QUERY);
    const update = () => setTier(readTier());
    update();
    md.addEventListener('change', update);
    lg.addEventListener('change', update);
    return () => {
      md.removeEventListener('change', update);
      lg.removeEventListener('change', update);
    };
  }, []);

  return {
    tier,
    isPhone: tier === 'phone',
    isTablet: tier === 'tablet',
    isDesktop: tier === 'desktop',
    isMobileShell: tier !== 'desktop',
  };
}
