import * as React from "react";
import { cn } from "../../lib/utils";

/** Plain form with the vertical rhythm used across settings and sheets. */
export function Form({ className, ...props }: React.FormHTMLAttributes<HTMLFormElement>) {
  return <form className={cn("space-y-1", className)} {...props} />;
}

/** One label + control row. */
export function FormItem({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-3 flex flex-col gap-1.5", className)} {...props} />;
}
