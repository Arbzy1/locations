import { Component, type ReactNode } from 'react';
import { Button } from './button';
import { ErrorState } from './states';

type ErrorBoundaryProps = {
  children: ReactNode;
  title?: string;
  resetKey?: string;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch() {
    // Do not log PII, route params, or coordinates to console or third-party trackers.
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full min-h-[16rem] w-full items-center justify-center bg-bg p-6 text-text">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-4 shadow-lg">
            <ErrorState
              title={this.props.title ?? 'Something went wrong on this screen.'}
              message="Try again, or reload the page if the problem continues."
              onRetry={this.handleRetry}
              retryTitle="Retry rendering this view"
            />
            <div className="px-4 pb-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                title="Reload the application"
                onClick={this.handleReload}
              >
                Reload page
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
