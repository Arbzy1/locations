import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import ThemeToggle from '../shell/ThemeToggle';
import { LegalFooter } from '../legal/LegalFooter';
import { enterMotion } from '../../lib/motion';
import AuthHero from './AuthHero';

type Props = {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
};

export default function AuthShell({ title, subtitle, children }: Props) {
  const reduce = useReducedMotion();
  const panelMotion = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.08 } }
    : enterMotion;

  return (
    <div className="relative flex h-dvh w-screen overflow-hidden bg-bg">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.32] lg:pointer-events-auto lg:relative lg:w-[52%] lg:shrink-0 lg:opacity-100"
        aria-hidden
      >
        <AuthHero />
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto bg-transparent lg:bg-bg safe-pt safe-pb safe-px">
        <div className="absolute right-4 top-4 z-20 lg:right-6 lg:top-6">
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16 lg:px-8 lg:py-10">
          <motion.div
            {...panelMotion}
            className="rounded-2xl border border-border bg-surface/90 p-6 shadow-2xl backdrop-blur-md lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none"
          >
            <h1 className="font-display text-3xl font-semibold tracking-tight text-text">{title}</h1>
            {subtitle ? <div className="mt-2 text-sm leading-relaxed text-text-muted">{subtitle}</div> : null}
            <p className="mt-3 text-xs leading-relaxed text-text-muted">
              Private Takeout import. No live tracking. No marketing mail.
            </p>
            <div className="mt-6">{children}</div>
            <LegalFooter />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
