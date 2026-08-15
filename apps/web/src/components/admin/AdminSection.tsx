import type { ReactNode } from "react";
import { Card, CardTitle } from "../ui/card";

export function AdminSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-text">{title}</h2>
        {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function AdminCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <Card className="space-y-2">
      {title && <CardTitle className="text-base">{title}</CardTitle>}
      {children}
    </Card>
  );
}

export function AdminError({ message = "Not found." }: { message?: string }) {
  return <p className="text-sm text-text-muted">{message}</p>;
}
