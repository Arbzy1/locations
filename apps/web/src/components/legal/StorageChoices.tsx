import { Link } from 'react-router-dom';
import { LegalFooter } from './LegalFooter';
import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Button } from '../ui/button';
import { storageChoice, setStorageChoice } from '../../lib/preference-storage';
import { enterMotion, reducedEnterMotion } from '../../lib/motion';

export default function StorageChoices() {
  const [open, setOpen] = useState(() => storageChoice() === null);
  const reduce = useReducedMotion();
  const choose = (allow: boolean) => { setStorageChoice(allow); setOpen(false); };
  return <>
    <div className="flex gap-2 fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-3 z-40 lg:bottom-3">
      <Button asChild size="sm" variant="outline" title="Read legal policies and operator details"><Link to="/impressum">Legal</Link></Button>
      <Button size="sm" variant="outline" title="Change optional browser storage choices" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-controls="storage-choices">Storage choices</Button>
    </div>
    <AnimatePresence>{open && <motion.section id="storage-choices" aria-label="Browser storage choices" className="fixed inset-x-3 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-50 mx-auto max-h-[60dvh] max-w-xl overflow-auto rounded-xl border border-border bg-surface p-4 text-text shadow-lg lg:bottom-16" {...(reduce ? reducedEnterMotion : enterMotion)}>
      <h2 className="font-semibold">Remember preferences on this device?</h2>
      <p className="my-3 text-sm text-text-muted">Essential sign-in storage is always used. With your permission we also save appearance, recent places, filters, goals and the last journey estimate. Refusing keeps preferences in memory for this page. No advertising or analytics trackers. Change or withdraw here at any time. See the Cookies link in the legal footer for the full inventory.</p>
      <LegalFooter />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" title="Refuse optional persistent storage and remove saved preferences" onClick={() => choose(false)}>Reject saved preferences</Button>
        <Button variant="outline" title="Allow optional preferences to persist on this device" onClick={() => choose(true)}>Allow saved preferences</Button>
      </div>
    </motion.section>}</AnimatePresence>
  </>;
}
