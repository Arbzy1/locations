import { useEffect, useRef, useState } from "react";
import {
  IMPORT_CUT_IN_MS,
  importCutInCopy,
  prefersImportCutInReducedMotion,
  type ImportCutInJob,
} from "../lib/explorer/import-cut-in";
import "../import-cut-in.css";

type Props = {
  job: ImportCutInJob | null;
  onHostSplit: (on: boolean) => void;
  onDone: () => void;
};

export default function ImportCutIn({ job, onHostSplit, onDone }: Props) {
  const [phase, setPhase] = useState<string>("");
  const [hidden, setHidden] = useState(true);
  const [copy, setCopy] = useState(() => importCutInCopy({}));
  const [status, setStatus] = useState("");
  const busyRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const onHostSplitRef = useRef(onHostSplit);
  const onDoneRef = useRef(onDone);
  onHostSplitRef.current = onHostSplit;
  onDoneRef.current = onDone;

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const id of timers) window.clearTimeout(id);
      timers.length = 0;
    };
  }, []);

  useEffect(() => {
    if (!job) return;
    if (busyRef.current) return;
    busyRef.current = true;
    const nextCopy = importCutInCopy(job);
    setCopy(nextCopy);
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];

    const later = (ms: number, fn: () => void) => {
      const id = window.setTimeout(fn, ms);
      timersRef.current.push(id);
    };

    const reduced = prefersImportCutInReducedMotion();
    setHidden(false);
    setPhase("");

    if (reduced) {
      onHostSplitRef.current(false);
      setPhase("import-cut-in--reduced import-cut-in--hold");
      setStatus(nextCopy.status);
      later(IMPORT_CUT_IN_MS.hold, () => {
        setHidden(true);
        setPhase("");
        setStatus("");
        busyRef.current = false;
        onDoneRef.current();
      });
      return;
    }

    const { slit, open, content, hold, exit } = IMPORT_CUT_IN_MS;
    setPhase("import-cut-in--slit");
    onHostSplitRef.current(true);

    later(slit, () => setPhase("import-cut-in--open"));
    later(slit + open, () => {
      setPhase("import-cut-in--content");
      setStatus(nextCopy.status);
    });
    later(slit + open + content, () => setPhase("import-cut-in--hold"));
    later(slit + open + content + hold, () => {
      setPhase("import-cut-in--exit");
      onHostSplitRef.current(false);
    });
    later(slit + open + content + hold + exit, () => {
      setHidden(true);
      setPhase("");
      setStatus("");
      busyRef.current = false;
      onDoneRef.current();
    });
  }, [job]);

  const className = ["import-cut-in", ...phase.split(" ").filter(Boolean)].join(" ");

  return (
    <div className={className} hidden={hidden} data-import-cut-in>
      <div className="import-cut-in__strip" aria-hidden="true">
        <div className="import-cut-in__backing import-cut-in__backing--accent" />
        <div className="import-cut-in__backing import-cut-in__backing--fill" />
        <span className="import-cut-in__shard import-cut-in__shard--1" />
        <span className="import-cut-in__shard import-cut-in__shard--2" />
        <span className="import-cut-in__shard import-cut-in__shard--3" />
        <div className="import-cut-in__body">
          <p className="import-cut-in__eyebrow">{copy.eyebrow}</p>
          <p className="import-cut-in__headline font-display">{copy.headline}</p>
          <p className="import-cut-in__meta">{copy.meta}</p>
        </div>
      </div>
      <p className="import-cut-in__status" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
