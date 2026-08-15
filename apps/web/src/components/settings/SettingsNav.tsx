import { CreditCard, LayoutDashboard, Lock, Ruler, Upload, User } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import type { SettingsSection } from "../../lib/settings/settings-section";

const ITEMS: {
  id: SettingsSection;
  label: string;
  title: string;
  icon: typeof User;
}[] = [
  { id: "overview", label: "Overview", title: "Settings overview", icon: LayoutDashboard },
  { id: "account", label: "Account", title: "Account, email, and devices", icon: User },
  { id: "billing", label: "Billing", title: "Subscription and invoices", icon: CreditCard },
  { id: "display", label: "Display", title: "Colour moods, units, timezone, and map tiles", icon: Ruler },
  { id: "data", label: "Timeline", title: "Import and manage Timeline data", icon: Upload },
  { id: "privacy", label: "Privacy", title: "Exports and delete account", icon: Lock },
];

type Props = {
  section: SettingsSection;
  onSelect: (section: SettingsSection) => void;
  orientation: "rail" | "chips";
};

export default function SettingsNav({ section, onSelect, orientation }: Props) {
  const reduce = useReducedMotion();
  return (
    <nav
      className={cn(
        orientation === "rail" ? "flex flex-col gap-1" : "flex gap-1 overflow-x-auto pb-0.5",
      )}
      aria-label="Settings sections"
    >
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const active = item.id === section;
        return (
          <Button
            key={item.id}
            type="button"
            variant="ghost"
            title={item.title}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative justify-start",
              orientation === "rail" ? "w-full" : "shrink-0",
              active ? "text-text" : "text-text-muted",
            )}
            onClick={() => onSelect(item.id)}
          >
            {active &&
              (reduce ? (
                <span className="absolute inset-0 rounded-lg bg-accent/15" />
              ) : (
                <motion.span
                  layoutId="settings-nav"
                  className="absolute inset-0 rounded-lg bg-accent/15"
                  transition={{ type: "spring", stiffness: 400, damping: 22 }}
                />
              ))}
            <span className="relative z-10 flex items-center gap-2">
              <Icon size={16} />
              {item.label}
            </span>
          </Button>
        );
      })}
    </nav>
  );
}
