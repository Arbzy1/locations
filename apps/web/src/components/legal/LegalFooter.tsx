import { motion, useReducedMotion } from 'motion/react';
import { Link } from 'react-router-dom';
import { legalLinks } from '../../config/legal';
import { interactiveMotion, reducedInteractiveMotion } from '../../lib/motion';
import { AppVersionLink } from '../shell/AppVersion';
const MotionLink = motion.create(Link);
export function LegalFooter() {
  const reduced = useReducedMotion();
  return <footer className="mt-6 text-center text-xs text-text-muted">
    <AppVersionLink />
    <nav aria-label="Legal" className="mt-2 flex flex-wrap justify-center gap-x-3">
      {legalLinks.map(([to, label]) => <MotionLink key={to} to={to} title={label} className="inline-flex min-h-11 items-center text-accent hover:underline focus-visible:ring-2" {...(reduced ? reducedInteractiveMotion : interactiveMotion)}>{label}</MotionLink>)}
    </nav>
  </footer>;
}
