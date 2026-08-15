import type { ReactNode } from 'react';

export default function CatalogPage({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="h-full overflow-y-auto bg-surface">
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <div>
          <h2 className="text-xl font-semibold text-text">{title}</h2>
          {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
