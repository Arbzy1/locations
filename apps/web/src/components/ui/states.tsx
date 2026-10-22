import type { ReactNode } from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';
import { Button } from './button';
import { cn } from '../../lib/utils';

/** Nothing to show yet: say why and, when there is one, what to do next. */
export function EmptyState({
  title,
  body,
  icon,
  action,
  className,
}: {
  title: string;
  body?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-4 py-10 text-center', className)}>
      <span className="text-text-muted">{icon ?? <Inbox size={24} />}</span>
      <p className="text-sm font-medium text-text">{title}</p>
      {body && <p className="max-w-sm text-sm text-text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Something failed: the reason in plain words and a way to try again. */
export function ErrorState({
  title = 'This did not load.',
  message,
  onRetry,
  retryTitle = 'Try loading this again',
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryTitle?: string;
  className?: string;
}) {
  return (
    <div role="alert" className={cn('flex flex-col items-start gap-1 p-4 text-sm', className)}>
      <p className="flex items-center gap-2 font-medium text-text">
        <AlertTriangle size={16} className="text-destructive" />
        {title}
      </p>
      {message && <p className="text-text-muted">{message}</p>}
      {onRetry && (
        <Button type="button" size="sm" className="mt-2" title={retryTitle} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
