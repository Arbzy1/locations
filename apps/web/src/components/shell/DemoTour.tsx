import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { enterMotion } from '../../lib/motion';
import { usePublicConfig } from '../../hooks/useApi';
import { useSession } from '../../lib/auth';

const STORAGE_KEY = 'locations-demo-tour';

const STEPS = [
  {
    path: '/hotspots',
    title: 'Hotspots',
    body: 'Places from your import as a heatmap. Filters stay in the URL. This is not live GPS.',
  },
  {
    path: '/day',
    title: 'Day View',
    body: 'One imported day: stays, journeys, and playback along cached routes.',
  },
  {
    path: '/insights',
    title: 'Insights',
    body: 'Totals and charts for the import. Email never includes coordinates or place names.',
  },
  {
    path: '/settings',
    title: 'Settings',
    body: 'Import Takeout, units, billing, and account delete. Demo accounts cannot import.',
  },
] as const;

export default function DemoTour() {
  const { data: session } = useSession();
  const { data: config } = usePublicConfig();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const enabled = config?.flags?.demoTour !== false && role === 'demo';
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === 'done') return;
    } catch {
      /* ignore quota */
    }
    setOpen(true);
    setStep(0);
  }, [enabled]);

  if (!enabled || !open) return null;

  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  const finish = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, 'done');
    } catch {
      /* ignore quota */
    }
    setOpen(false);
  };

  const go = (next: number) => {
    const target = STEPS[next];
    if (!target) {
      finish();
      return;
    }
    setStep(next);
    navigate(target.path);
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[2400] flex items-end justify-center bg-bg/60 p-4 safe-pb lg:items-center"
        initial={reduce ? { opacity: 0 } : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={reduce ? { duration: 0.08 } : { duration: 0.4 }}
      >
        <motion.div
          className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-lg"
          {...(reduce ? { initial: { opacity: 0 }, animate: { opacity: 1 } } : enterMotion)}
          role="dialog"
          aria-labelledby="demo-tour-title"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            Demo tour {step + 1} of {STEPS.length}
          </p>
          <h2 id="demo-tour-title" className="mt-1 font-display text-lg font-semibold text-text">
            {current.title}
          </h2>
          <p className="mt-2 text-sm text-text-muted">{current.body}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="ghost" title="Skip the demo tour" onClick={finish}>
              Skip
            </Button>
            {step > 0 && (
              <Button type="button" variant="outline" title="Previous tour step" onClick={() => go(step - 1)}>
                Back
              </Button>
            )}
            <Button
              type="button"
              title={last ? 'Finish the demo tour' : 'Next tour step'}
              onClick={() => (last ? finish() : go(step + 1))}
            >
              {last ? 'Done' : 'Next'}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
