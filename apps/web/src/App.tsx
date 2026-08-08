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
import ThemeToggle from './components/ThemeToggle';
import {
  Flame,
  Calendar,
  Compass,
  TrendingUp,
  Loader2,
  LogOut,
  Settings,
  Upload,
  MoreHorizontal,
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
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-colors duration-ui-hover ease-ui hover:bg-accent/90"
      >
        Open Settings
      </button>
    </div>
  );
}

function NavTabButton({
  tab,
  active,
  onSelect,
  compact,
}: {
  tab: { id: TabId; label: string; icon: React.ReactNode };
  active: boolean;
  onSelect: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex items-center justify-center rounded-lg transition-colors duration-ui-emphasis ease-ui ${
        compact
          ? 'h-11 min-w-0 flex-1 flex-col gap-0.5 px-1 text-[10px]'
          : 'h-11 w-11'
      } ${
        active
          ? 'bg-accent/20 text-accent'
          : 'text-text-muted hover:bg-bg/50 hover:text-text'
      }`}
      title={tab.label}
      aria-label={tab.label}
      aria-current={active ? 'page' : undefined}
    >
      {tab.icon}
      {compact && <span className="truncate">{tab.label.split(' ')[0]}</span>}
    </button>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabId>('hotspots');
  const [dayViewDate, setDayViewDate] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const { data: routeProgress } = useRouteProgress();
  const { data: overview, isLoading: overviewLoading } = useOverview();
  const { data: importStatus } = useImportStatus({
    poll: true,
  });
  const { data: session } = useSession();
  const isDemo = (session?.user as { role?: string } | undefined)?.role === 'demo';

  useDocumentTitle(`${TAB_LABELS[activeTab]} · Locations`);

  const selectTab = (id: TabId) => {
    setMoreOpen(false);
    setActiveTab(id);
  };

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

  const signOutButton = (
    <button
      type="button"
      onClick={() => {
        queryClient.clear();
        void signOut();
      }}
      className="flex h-11 w-11 items-center justify-center rounded-lg text-text-muted transition-colors duration-ui-emphasis ease-ui hover:bg-bg/50 hover:text-text"
      title={session?.user?.email ? `Sign out (${session.user.email})` : 'Sign out'}
      aria-label="Sign out"
    >
      <LogOut size={16} />
    </button>
  );

  return (
    <div className="relative flex h-dvh w-screen flex-col overflow-hidden bg-bg safe-pt safe-px">
      {isDemo && (
        <div className="flex shrink-0 flex-col gap-2 border-b border-accent/30 bg-accent/10 px-4 py-2 text-xs text-accent sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <span>
            You&apos;re viewing the <strong className="font-semibold">public demo</strong> with
            sample places - not real personal history.
          </span>
          <button
            type="button"
            title="Exit demo and return to the sign-in screen"
            onClick={() => {
              queryClient.clear();
              void signOut();
            }}
            className="shrink-0 self-start rounded-md border border-accent/40 px-2 py-1.5 transition-colors duration-ui-hover ease-ui hover:bg-accent/20 sm:self-auto"
          >
            Exit demo
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Desktop left rail */}
        <div className="hidden w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-surface py-4 lg:flex">
          <div
            className="mb-4 font-display text-lg font-bold tracking-tight text-accent"
            title="Locations"
          >
            L
          </div>

          {TABS.map((tab) => (
            <NavTabButton
              key={tab.id}
              tab={tab}
              active={activeTab === tab.id}
              onSelect={() => selectTab(tab.id)}
            />
          ))}

          <div className="mt-auto flex flex-col items-center gap-2">
            <ThemeToggle className="h-11 w-11" />
            {!isDemo && (
              <button
                type="button"
                onClick={() => selectTab('settings')}
                className={`flex h-11 w-11 items-center justify-center rounded-lg transition-colors duration-ui-emphasis ease-ui ${
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
            {signOutButton}
          </div>
        </div>

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden mobile-nav-pad lg:pb-0">
            {activeTab === 'settings' && !isDemo ? (
              <div key="settings" className="ui-enter h-full">
                <SettingsView />
              </div>
            ) : overviewLoading && !isDemo ? (
              <div className="flex h-full items-center justify-center text-text-muted">
                <Loader2 className="animate-spin text-accent" size={24} />
              </div>
            ) : !hasData ? (
              importing ? (
                <div className="ui-enter flex h-full flex-col items-center justify-center gap-3 bg-bg text-text-muted">
                  <Loader2 className="animate-spin text-accent" size={24} />
                  <p className="text-sm">Importing Timeline data…</p>
                </div>
              ) : (
                <div key="empty" className="ui-enter h-full">
                  <EmptyDataState onOpenSettings={() => selectTab('settings')} />
                </div>
              )
            ) : (
              <div key={activeTab} className="ui-enter h-full overflow-hidden">
                {activeTab === 'hotspots' && <HotspotsView />}
                {activeTab === 'day' && <DayView initialDate={dayViewDate} />}
                {activeTab === 'trips' && <DayTripsView onSelectDate={handleSelectDate} />}
                {activeTab === 'insights' && <InsightsView />}
              </div>
            )}
          </div>

          {/* Mobile / tablet bottom nav */}
          <nav
            className="absolute inset-x-0 bottom-0 z-[1200] flex items-stretch gap-0.5 border-t border-border bg-surface/95 px-1 pt-1 backdrop-blur-sm safe-pb lg:hidden"
            aria-label="Main"
          >
            {TABS.map((tab) => (
              <NavTabButton
                key={tab.id}
                tab={tab}
                active={activeTab === tab.id}
                onSelect={() => selectTab(tab.id)}
                compact
              />
            ))}
            <div className="relative flex flex-1">
              <button
                type="button"
                title="More options"
                aria-label="More options"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((v) => !v)}
                className={`flex h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[10px] transition-colors duration-ui-emphasis ease-ui ${
                  moreOpen || activeTab === 'settings'
                    ? 'bg-accent/20 text-accent'
                    : 'text-text-muted hover:bg-bg/50 hover:text-text'
                }`}
              >
                <MoreHorizontal size={18} />
                <span>More</span>
              </button>
              {moreOpen && (
                <div className="absolute bottom-full right-0 mb-2 flex min-w-[10rem] flex-col gap-1 rounded-lg border border-border bg-surface p-2 shadow-lg ui-enter">
                  <div className="flex items-center justify-between gap-2 px-1">
                    <span className="text-xs text-text-muted">Theme</span>
                    <ThemeToggle className="h-11 w-11" />
                  </div>
                  {!isDemo && (
                    <button
                      type="button"
                      title="Settings"
                      aria-label="Settings"
                      onClick={() => selectTab('settings')}
                      className={`flex h-11 items-center gap-2 rounded-lg px-3 text-sm transition-colors duration-ui-hover ease-ui ${
                        activeTab === 'settings'
                          ? 'bg-accent/20 text-accent'
                          : 'text-text-muted hover:bg-bg/50 hover:text-text'
                      }`}
                    >
                      <Settings size={16} />
                      Settings
                    </button>
                  )}
                  {routeProgress && routeProgress.percent < 100 && (
                    <div
                      className="flex h-11 items-center gap-2 px-3 text-xs text-text-muted"
                      title={`Routes cached: ${routeProgress.percent}%`}
                    >
                      <Loader2 size={14} className="animate-spin text-accent" />
                      Routes {routeProgress.percent}%
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      queryClient.clear();
                      void signOut();
                    }}
                    className="flex h-11 items-center gap-2 rounded-lg px-3 text-sm text-text-muted transition-colors duration-ui-hover ease-ui hover:bg-bg/50 hover:text-text"
                    title={
                      session?.user?.email ? `Sign out (${session.user.email})` : 'Sign out'
                    }
                    aria-label="Sign out"
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </nav>
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
      <div className="flex h-dvh w-screen items-center justify-center bg-bg text-text-muted">
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
