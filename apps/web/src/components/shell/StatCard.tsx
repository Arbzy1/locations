import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: string | number;
  description?: string;
  icon?: ReactNode;
}

export default function StatCard({ label, value, description, icon }: Props) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4 transition-colors duration-ui-emphasis ease-ui hover:border-accent/30">
      <div className="flex items-center gap-2 mb-1">
        {icon && <span className="text-accent">{icon}</span>}
        <span className="text-text-muted text-sm">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-text">{value}</div>
      {description && (
        <div className="text-text-muted text-xs mt-1">{description}</div>
      )}
    </div>
  );
}
