import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TabId } from './types';
import {
  useImportStatus,
  useOverview,
  useRouteProgress,
} from './hooks/useApi';
import { useSession, signOut } from './lib/auth';
import HotspotsView from './components/HotspotsView';
import DayView from './components/DayView';
import DayTripsView from './components/DayTripsView';
import InsightsView from './components/InsightsView';
import SettingsView from './components/SettingsView';
import LoginPage from './components/LoginPage';
import {
  Flame,
  Calendar,
  Compass,
  TrendingUp,
  Loader2,
  LogOut,
  Settings,
  Upload,
} from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof Error && error.message.includes('401')) return false;
        return failureCount < 2;
      },
    },
  },
});

const TAB_LABELS: Record<TabId, string> = {
  hotspots: 'Hotspots',
  day: 'Day View',
  trips: 'Day Trips',
  insights: 'Insights',
  settings: 'Settings',
};

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'hotspots', label: TAB_LABELS.hotspots, icon: <Flame size={18} /> },
  { id: 'day', label: TAB_LABELS.day, icon: <Calendar size={18} /> },
  { id: 'trips', label: TAB_LABELS.trips, icon: <Compass size={18} /> },
  { id: 'insights', label: TAB_LABELS.insights, icon: <TrendingUp size={18} /> },
];

function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

function EmptyDataState({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
      <div className="rounded-full bg-accent/15 p-4 text-accent">
        <Upload size={28} />
      </div>
      <div className="max-w-sm">
        <h2 className="font-display text-lg font-semibold text-text">Import your Timeline</h2>
        <p className="mt-2 text-sm text-text-muted">
          Upload a Google Timeline JSON export in Settings. You can replace it anytime with a newer
          export.
        </p>
      </div>
      <button
        type="button"
        title="Open Settings to upload your Timeline JSON"
        onClick={onOpenSettings}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg hover:bg-accent/90"
      >
        Open Settings
      </button>
    </div>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabId>('hotspots');
  const [dayViewDate, setDayViewDate] = useState('');
  const { data: routeProgress } = useRouteProgress();
  const { data: overview, isLoading: overviewLoading } = useOverview();
  const { data: importStatus } = useImportStatus({
    poll: true,
  });
  const { data: session } = useSession();
  const isDemo = (session?.user as { role?: string } | undefined)?.role === 'demo';

  useDocumentTitle(`${TAB_LABELS[activeTab]} · Locations`);

  const importing =
    importStatus?.latestJob?.status === 'pending' ||
    importStatus?.latestJob?.status === 'processing';

  const hasData =
    isDemo ||
    (overview?.total_visits ?? 0) > 0 ||
    (overview?.total_activities ?? 0) > 0;

  const handleSelectDate = (date: string) => {
    setDayViewDate(date);
    setActiveTab('day');
  };

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-bg">
      {isDemo && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-accent/30 bg-accent/10 px-4 py-2 text-xs text-accent">
          <span>
            You’re viewing the <strong className="font-semibold">public demo</strong> with sample
            places — not real personal history.
          </span>
          <button
            type="button"
            title="Exit demo and return to the sign-in screen"
            onClick={() => {
              queryClient.clear();
              void signOut();
            }}
            className="shrink-0 rounded-md border border-accent/40 px-2 py-1 hover:bg-accent/20"
          >
            Exit demo
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-surface py-4">
          <div
            className="mb-4 font-display text-lg font-bold tracking-tight text-accent"
            title="Locations"
          >
            L
          </div>

          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-accent/20 text-accent'
                  : 'text-text-muted hover:bg-bg/50 hover:text-text'
              }`}
              title={tab.label}
              aria-label={tab.label}
            >
              {tab.icon}
            </button>
          ))}

          <div className="mt-auto flex flex-col items-center gap-2">
            {!isDemo && (
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                  activeTab === 'settings'
                    ? 'bg-accent/20 text-accent'
                    : 'text-text-muted hover:bg-bg/50 hover:text-text'
                }`}
                title="Settings"
                aria-label="Settings"
              >
                <Settings size={16} />
              </button>
            )}
            {routeProgress && routeProgress.percent < 100 && (
              <div title={`Routes cached: ${routeProgress.percent}%`}>
                <Loader2 size={16} className="animate-spin text-accent" />
              </div>
            )}
            <button
              onClick={() => {
                queryClient.clear();
                void signOut();
              }}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg/50 hover:text-text"
              title={session?.user?.email ? `Sign out (${session.user.email})` : 'Sign out'}
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {activeTab === 'settings' && !isDemo ? (
            <SettingsView />
          ) : overviewLoading && !isDemo ? (
            <div className="flex h-full items-center justify-center text-text-muted">
              <Loader2 className="animate-spin text-accent" size={24} />
            </div>
          ) : !hasData ? (
            importing ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg text-text-muted">
                <Loader2 className="animate-spin text-accent" size={24} />
                <p className="text-sm">Importing Timeline data…</p>
              </div>
            ) : (
              <EmptyDataState onOpenSettings={() => setActiveTab('settings')} />
            )
          ) : (
            <>
              {activeTab === 'hotspots' && <HotspotsView />}
              {activeTab === 'day' && <DayView initialDate={dayViewDate} />}
              {activeTab === 'trips' && <DayTripsView onSelectDate={handleSelectDate} />}
              {activeTab === 'insights' && <InsightsView />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AuthGate() {
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (isPending) {
      document.title = 'Locations';
    } else if (!session?.user) {
      document.title = 'Sign in · Locations';
    }
  }, [isPending, session?.user]);

  if (isPending) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg text-text-muted">
        <Loader2 className="animate-spin text-accent" size={24} />
      </div>
    );
  }

  if (!session?.user) {
    return <LoginPage />;
  }

  return <AppContent />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate />
    </QueryClientProvider>
  );
}
