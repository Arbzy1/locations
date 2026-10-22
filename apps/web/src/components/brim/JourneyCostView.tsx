import { lazy, Suspense } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useLocation, useNavigate } from "react-router-dom";
import { Car, History, Route } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { Skeleton } from "../ui/skeleton";
import { enterMotion, reducedEnterMotion } from "../../lib/motion";
import {
  journeyCostPath,
  journeyCostSectionFromPath,
  type JourneyCostSection,
} from "../../lib/nav/paths";
import { EstimateView } from "./EstimateView";

const GarageView = lazy(() => import("./GarageView").then((mod) => ({ default: mod.GarageView })));
const HistoryView = lazy(() => import("./HistoryView").then((mod) => ({ default: mod.HistoryView })));

const SECTIONS: { id: JourneyCostSection; label: string; title: string; icon: typeof Route }[] = [
  { id: "estimate", label: "Estimate", title: "Price a trip: fuel or charging, tolls, clean-air zones", icon: Route },
  { id: "garage", label: "Garage", title: "Saved cars, tariffs, and fill-ups", icon: Car },
  { id: "history", label: "History", title: "Saved journeys and the tax-year mileage tally", icon: History },
];

/** Journey cost (formerly Brim): true trip cost for UK drivers, inside the Locations shell. */
export default function JourneyCostView() {
  const location = useLocation();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const section = journeyCostSectionFromPath(location.pathname);
  const enter = reduce ? reducedEnterMotion : enterMotion;

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <h1 className="font-display text-base font-semibold text-text">Journey cost</h1>
        <Tabs
          value={section}
          onValueChange={(next) => navigate(journeyCostPath(next as JourneyCostSection))}
        >
          <TabsList aria-label="Journey cost sections">
            {SECTIONS.map(({ id, label, title, icon: Icon }) => (
              <TabsTrigger key={id} value={id} title={title} className="gap-1.5">
                <span className="inline-flex items-center gap-1.5">
                  <Icon size={14} aria-hidden />
                  {label}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>
      <div className="relative min-h-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={section}
            initial={enter.initial}
            animate={enter.animate}
            exit={enter.exit}
            transition={enter.transition}
            className={
              section === "estimate"
                ? "absolute inset-0 flex flex-col overflow-hidden"
                : "absolute inset-0 overflow-y-auto"
            }
          >
            {section === "estimate" ? (
              <EstimateView />
            ) : (
              <Suspense
                fallback={
                  <div className="mx-auto w-[min(720px,calc(100%-1.5rem))] py-6" aria-busy="true">
                    <Skeleton className="mb-3 h-10 w-48" />
                    <Skeleton className="h-40 w-full" />
                  </div>
                }
              >
                {section === "garage" ? <GarageView /> : <HistoryView />}
              </Suspense>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
