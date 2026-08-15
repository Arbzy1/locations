import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { TabId } from './types';
import {
  useImportStatus,
  useOverview,
  usePublicConfig,
  useRouteProgress,
} from './hooks/useApi';
import { useSession, signOut } from './lib/auth';
import { UnitsProvider } from './lib/units';
import { loadNavExpanded, saveNavExpanded } from './lib/nav/nav-memory';
import { interactiveMotion, reducedInteractiveMotion } from './lib/motion';
import { cn } from './lib/utils';
import HotspotsView from './components/explorer/HotspotsView';
import DayView from './components/explorer/DayView';
import DayTripsView from './components/explorer/DayTripsView';
import InsightsView from './components/explorer/InsightsView';
import SettingsView from './components/settings/SettingsView';
import LoginPage from './components/auth/LoginPage';
import SignupPage from './components/auth/SignupPage';
import ForgotPage from './components/auth/ForgotPage';
import ResetPasswordPage from './components/auth/ResetPasswordPage';
import { CookiesRoute, PrivacyRoute, TermsRoute } from './components/legal/LegalRoutes';
import LandingPage from './components/marketing/LandingPage';
import PricingPage from './components/marketing/PricingPage';
import StatusPage from './components/marketing/StatusPage';
import ChangelogPage from './components/marketing/ChangelogPage';
import DemoTour from './components/shell/DemoTour';
import ThemeToggle from './components/shell/ThemeToggle';
import CommandPalette from './components/shell/CommandPalette';
import { Button } from './components/ui/button';
import ImportDropZone from './components/explorer/ImportDropZone';
import { Toaster } from './components/ui/sonner';
import ExploreMenu from './components/shell/ExploreMenu';
import CatalogRouter from './components/catalog/CatalogRouter';
import ImportCutIn from './components/ImportCutIn';
import { isCatalogPath, catalogTitle } from './lib/nav/paths';
import { shouldFireImportCutIn, type ImportCutInJob } from './lib/explorer/import-cut-in';
import { adminPageLabel } from './components/admin/adminNav';
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
  PanelLeft,
  PanelLeftClose,
  Shield,
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

function tabFromPath(pathname: string): TabId {
  if (pathname.startsWith('/day')) return 'day';
  if (pathname === '/trips' || pathname === '/trips/') return 'trips';
  if (pathname.startsWith('/insights') || pathname.startsWith('/review')) return 'insights';
  if (pathname.startsWith('/settings')) return 'settings';
  return 'hotspots';
}

function pathForTab(id: TabId, date?: string) {
  if (id === 'day') return date ? `/day/${date}` : '/day';
  return `/${id}`;
}

function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

function EmptyDataState({
  onOpenSettings,
  isDemo,
}: {
  onOpenSettings: () => void;
  isDemo: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
      <div className="rounded-full bg-accent/15 p-4 text-accent">
        <Upload size={28} />
      </div>
      <div className="max-w-sm">
        <h2 className="font-display text-lg font-semibold text-text">Import your Timeline</h2>
        <p className="mt-2 text-sm text-text-muted">
          Drop a Google Timeline JSON or Takeout zip here. You can replace it anytime with a newer
          export.
        </p>
      </div>
      <div className="w-full max-w-md text-left">
        <ImportDropZone
          disabled={isDemo}
          disabledReason={isDemo ? 'Demo accounts cannot import Timeline data.' : undefined}
        />
      </div>
      <Button type="button" title="Open Settings to upload Timeline data" onClick={onOpenSettings}>
        Open Settings
      </Button>
      <Button type="button" variant="outline" title="Open onboarding steps" asChild>
        <Link to="/onboarding">Onboarding</Link>
      </Button>
    </div>
  );
}

const RAIL_COLLAPSED = 56;
const RAIL_EXPANDED = 208;

function RailLabel({ show, children }: { show: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.span
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: -6 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, x: -4 }}
          transition={reduce ? { duration: 0.08 } : { duration: 0.2 }}
          className="min-w-0 truncate whitespace-nowrap text-sm"
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function NavTabButton({
  tab,
  active,
  onSelect,
  compact,
  expanded,
}: {
  tab: { id: TabId; label: string; icon: React.ReactNode };
  active: boolean;
  onSelect: () => void;
  compact?: boolean;
  expanded?: boolean;
}) {
  const reduce = useReducedMotion();
  const motionProps = reduce ? reducedInteractiveMotion : interactiveMotion;
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex items-center rounded-lg transition-colors duration-300 ease-ui',
        compact
          ? 'h-11 min-w-0 flex-1 flex-col justify-center gap-0.5 px-1 text-[10px]'
          : expanded
            ? 'h-11 w-full justify-start gap-2 px-3'
            : 'h-11 w-11 justify-center',
        active ? 'bg-accent/20 text-accent' : 'text-text-muted hover:bg-bg/50 hover:text-text',
      )}
      title={tab.label}
      aria-label={tab.label}
      aria-current={active ? 'page' : undefined}
      {...motionProps}
    >
      {tab.icon}
      {compact && <span className="truncate">{tab.label.split(' ')[0]}</span>}
      <RailLabel show={!!expanded}>{tab.label}</RailLabel>
    </motion.button>
  );
}

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const activeTab = tabFromPath(location.pathname);
  const dayViewDate = params.date ?? '';
  const [moreOpen, setMoreOpen] = useState(false);
  const [navExpanded, setNavExpanded] = useState(loadNavExpanded);
  const [cutInJob, setCutInJob] = useState<ImportCutInJob | null>(null);
  const [hostSplit, setHostSplit] = useState(false);
  const reduceMotion = useReducedMotion();
  const navReady = useRef(false);
  const cutInPrimed = useRef(false);
  const cutInPrev = useRef<{ id: string; status: string } | null>(null);
  const { data: routeProgress } = useRouteProgress();
  const { data: overview, isLoading: overviewLoading } = useOverview();
  const { data: importStatus } = useImportStatus({
    poll: true,
  });
  const { data: session } = useSession();
  const isDemo = (session?.user as { role?: string } | undefined)?.role === 'demo';
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
  const isStaff =
    (session?.user as { role?: string } | undefined)?.role === 'admin' ||
    (session?.user as { role?: string } | undefined)?.role === 'developer';
  const adminActive = location.pathname.startsWith('/admin');

  const exploring = isCatalogPath(location.pathname);
  useDocumentTitle(
    adminActive
      ? `Admin · ${adminPageLabel(location.pathname)} · Locations`
      : `${exploring ? catalogTitle(location.pathname) : TAB_LABELS[activeTab]} · Locations`,
  );

  const selectTab = (id: TabId, date?: string) => {
    setMoreOpen(false);
    void navigate(pathForTab(id, date ?? dayViewDate));
  };

  const importing =
    importStatus?.latestJob?.status === 'pending' ||
    importStatus?.latestJob?.status === 'processing';

  const hasData =
    isDemo ||
    (overview?.total_visits ?? 0) > 0 ||
    (overview?.total_activities ?? 0) > 0;

  useEffect(() => {
    cutInPrimed.current = false;
    cutInPrev.current = null;
  }, [sessionUserId]);

  useEffect(() => {
    if (!importStatus) return;
    const latest = importStatus.latestJob;
    const snapshot = latest ? { id: latest.id, status: latest.status } : null;
    if (!cutInPrimed.current) {
      cutInPrimed.current = true;
      cutInPrev.current = snapshot;
      return;
    }
    if (shouldFireImportCutIn(cutInPrev.current, snapshot) && latest && !isDemo) {
      setCutInJob(latest);
    }
    cutInPrev.current = snapshot;
  }, [importStatus, isDemo, sessionUserId]);

  useEffect(() => {
    if (isDemo || overviewLoading || importing || hasData) return;
    if (location.pathname === '/hotspots') {
      void navigate('/onboarding', { replace: true });
    }
  }, [isDemo, overviewLoading, importing, hasData, location.pathname, navigate]);

  useEffect(() => {
    if (!navReady.current) {
      navReady.current = true;
      return;
    }
    const delay = reduceMotion ? 80 : 450;
    const id = window.setTimeout(() => window.dispatchEvent(new Event('resize')), delay);
    return () => window.clearTimeout(id);
  }, [navExpanded, reduceMotion]);

  const toggleNav = () => {
    setNavExpanded((current) => {
      const next = !current;
      saveNavExpanded(next);
      return next;
    });
  };

  const handleSelectDate = (date: string) => {
    selectTab('day', date);
  };

  const signOutTitle = session?.user?.email ? `Sign out (${session.user.email})` : 'Sign out';
  const signOutButton = (
    <Button
      type="button"
      variant="ghost"
      size={navExpanded ? 'default' : 'icon'}
      onClick={() => {
        queryClient.clear();
        void signOut();
      }}
      title={signOutTitle}
      aria-label="Sign out"
      className={navExpanded ? 'h-11 w-full justify-start gap-2 px-3' : undefined}
    >
      <LogOut size={16} />
      <RailLabel show={navExpanded}>Sign out</RailLabel>
    </Button>
  );

  return (
    <div className="relative flex h-dvh w-screen flex-col overflow-hidden bg-bg safe-pt safe-px">
      <ImportCutIn
        job={cutInJob}
        onHostSplit={setHostSplit}
        onDone={() => {
          setCutInJob(null);
          setHostSplit(false);
        }}
      />
      {isDemo && (
        <div className="flex shrink-0 flex-col gap-2 border-b border-accent/30 bg-accent/10 px-4 py-2 text-xs text-accent sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <span>
            You&apos;re viewing the <strong className="font-semibold">public demo</strong> with
            sample places - not real personal history.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            title="Exit demo and return to the sign-in screen"
            onClick={() => {
              queryClient.clear();
              void signOut();
            }}
            className="shrink-0 self-start sm:self-auto"
          >
            Exit demo
          </Button>
        </div>
      )}
      <div
        className={cn(
          'import-cut-in-host flex min-h-0 flex-1 overflow-hidden',
          hostSplit && 'import-cut-in-host--split',
        )}
      >
        <motion.aside
          className={cn(
            'import-cut-in-host__upper hidden shrink-0 flex-col gap-1 overflow-hidden border-r border-border bg-surface py-4 lg:flex',
            navExpanded ? 'items-stretch px-2' : 'items-center',
          )}
          initial={false}
          animate={{ width: navExpanded ? RAIL_EXPANDED : RAIL_COLLAPSED }}
          transition={
            reduceMotion
              ? { duration: 0.08 }
              : { type: 'spring', stiffness: 400, damping: 28 }
          }
        >
          <Link
            to="/hotspots"
            className={cn(
              'mb-4 font-display font-bold tracking-tight text-accent',
              navExpanded ? 'px-3 text-base' : 'text-lg',
            )}
            title="Locations"
          >
            {navExpanded ? 'Locations' : 'L'}
          </Link>

          {TABS.map((tab) => (
            <NavTabButton
              key={tab.id}
              tab={tab}
              active={!exploring && activeTab === tab.id}
              onSelect={() => selectTab(tab.id)}
              expanded={navExpanded}
            />
          ))}
          <ExploreMenu expanded={navExpanded} />
          {isStaff && (
            <Button
              asChild
              variant="ghost"
              size={navExpanded ? 'default' : 'icon'}
              className={cn(
                navExpanded ? 'h-11 w-full justify-start gap-2 px-3' : 'h-11 w-11',
                adminActive && 'bg-admin/15 text-admin hover:text-admin',
              )}
              title="Open Admin panel"
              aria-label="Open Admin panel"
              aria-current={adminActive ? 'page' : undefined}
            >
              <Link to="/admin">
                <Shield size={18} />
                <RailLabel show={navExpanded}>Admin</RailLabel>
              </Link>
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size={navExpanded ? 'default' : 'icon'}
            onClick={toggleNav}
            title={navExpanded ? 'Collapse navigation' : 'Expand navigation'}
            aria-label={navExpanded ? 'Collapse navigation' : 'Expand navigation'}
            aria-expanded={navExpanded}
            className={navExpanded ? 'h-11 w-full justify-start gap-2 px-3' : 'h-11 w-11'}
          >
            {navExpanded ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
            <RailLabel show={navExpanded}>Collapse</RailLabel>
          </Button>

          <div
            className={cn(
              'mt-auto flex flex-col gap-2',
              navExpanded ? 'items-stretch' : 'items-center',
            )}
          >
            <ThemeToggle className={navExpanded ? undefined : 'h-11 w-11'} showLabel={navExpanded} />
            {!isDemo && (
              <Button
                type="button"
                variant="ghost"
                size={navExpanded ? 'default' : 'icon'}
                onClick={() => selectTab('settings')}
                className={cn(
                  navExpanded && 'h-11 w-full justify-start gap-2 px-3',
                  activeTab === 'settings' ? 'bg-accent/20 text-accent' : '',
                )}
                title="Settings"
                aria-label="Settings"
              >
                <Settings size={16} />
                <RailLabel show={navExpanded}>Settings</RailLabel>
              </Button>
            )}
            {routeProgress && routeProgress.percent < 100 && (
              <div
                className={cn(
                  'flex items-center text-xs text-text-muted',
                  navExpanded ? 'h-11 gap-2 px-3' : 'h-11 w-11 justify-center',
                )}
                title={`Routes cached: ${routeProgress.percent}%`}
              >
                <Loader2 size={16} className="animate-spin text-accent" />
                <RailLabel show={navExpanded}>Routes {routeProgress.percent}%</RailLabel>
              </div>
            )}
            {signOutButton}
          </div>
        </motion.aside>

        <div className="import-cut-in-host__lower relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b border-border px-4 py-2">
            <CommandPalette />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden mobile-nav-pad lg:pb-0">
            {exploring ? (
              <div key={location.pathname} className="ui-enter h-full overflow-hidden">
                <CatalogRouter />
              </div>
            ) : activeTab === 'settings' && !isDemo ? (
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
                  <p className="text-sm">
                    Importing Timeline data…
                    {importStatus?.latestJob?.parsedCount
                      ? ` ${importStatus.latestJob.parsedCount} records`
                      : ''}
                  </p>
                </div>
              ) : (
                <div key="empty" className="ui-enter h-full">
                  <EmptyDataState isDemo={isDemo} onOpenSettings={() => selectTab('settings')} />
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

          <nav
            className="absolute inset-x-0 bottom-0 z-[1200] flex items-stretch gap-0.5 border-t border-border bg-surface/95 px-1 pt-1 backdrop-blur-sm safe-pb lg:hidden"
            aria-label="Main"
          >
            {TABS.map((tab) => (
              <NavTabButton
                key={tab.id}
                tab={tab}
                active={!exploring && activeTab === tab.id}
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
                className={`flex h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[10px] transition-colors duration-300 ease-ui ${
                  moreOpen || activeTab === 'settings' || exploring
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
                  <div className="max-h-48 overflow-y-auto">
                    <ExploreMenu compact />
                  </div>
                  {!isDemo && (
                    <Button
                      type="button"
                      variant="ghost"
                      title="Settings"
                      aria-label="Settings"
                      onClick={() => selectTab('settings')}
                      className="h-11 justify-start"
                    >
                      <Settings size={16} />
                      Settings
                    </Button>
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
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setMoreOpen(false);
                      queryClient.clear();
                      void signOut();
                    }}
                    className="h-11 justify-start"
                    title={
                      session?.user?.email ? `Sign out (${session.user.email})` : 'Sign out'
                    }
                    aria-label="Sign out"
                  >
                    <LogOut size={16} />
                    Sign out
                  </Button>
                </div>
              )}
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}

function AuthedShell() {
  return (
    <UnitsProvider>
      <DemoTour />
      <Routes>
        <Route path="/" element={<Navigate to="/hotspots" replace />} />
        <Route path="/hotspots" element={<AppContent />} />
        <Route path="/day/:date?" element={<AppContent />} />
        <Route path="/trips" element={<AppContent />} />
        <Route path="/trips/new" element={<AppContent />} />
        <Route path="/trips/:start/:end" element={<AppContent />} />
        <Route path="/insights" element={<AppContent />} />
        <Route path="/settings" element={<AppContent />} />
        <Route path="/places" element={<AppContent />} />
        <Route path="/places/:key" element={<AppContent />} />
        <Route path="/corridors/:a/:b" element={<AppContent />} />
        <Route path="/areas" element={<AppContent />} />
        <Route path="/areas/:settlement" element={<AppContent />} />
        <Route path="/coverage" element={<AppContent />} />
        <Route path="/compare" element={<AppContent />} />
        <Route path="/replay" element={<AppContent />} />
        <Route path="/month/:ym" element={<AppContent />} />
        <Route path="/week/:date" element={<AppContent />} />
        <Route path="/on-this-day" element={<AppContent />} />
        <Route path="/gaps" element={<AppContent />} />
        <Route path="/review" element={<AppContent />} />
        <Route path="/review/:year" element={<AppContent />} />
        <Route path="/holidays" element={<AppContent />} />
        <Route path="/commute" element={<AppContent />} />
        <Route path="/weekday" element={<AppContent />} />
        <Route path="/firsts" element={<AppContent />} />
        <Route path="/chapters" element={<AppContent />} />
        <Route path="/moving" element={<AppContent />} />
        <Route path="/anomaly" element={<AppContent />} />
        <Route path="/onboarding" element={<AppContent />} />
        <Route path="/imports" element={<AppContent />} />
        <Route path="/health" element={<AppContent />} />
        <Route path="/admin" element={<AppContent />} />
        <Route path="/admin/*" element={<AppContent />} />
        <Route path="/globe" element={<AppContent />} />
        <Route path="/updates" element={<AppContent />} />
        <Route path="/badges" element={<AppContent />} />
        <Route path="/guesses" element={<AppContent />} />
        <Route path="*" element={<Navigate to="/hotspots" replace />} />
      </Routes>
    </UnitsProvider>
  );
}

function AuthGate() {
  const { data: session, isPending } = useSession();
  const { data: config, isPending: configPending } = usePublicConfig();
  const landing = config?.flags?.landing !== false;

  useEffect(() => {
    if (isPending || configPending) {
      document.title = 'Locations';
    } else if (!session?.user) {
      document.title = landing ? 'Locations' : 'Sign in · Locations';
    }
  }, [isPending, configPending, session?.user, landing]);

  if (isPending || (!session?.user && configPending)) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-bg text-text-muted">
        <Loader2 className="animate-spin text-accent" size={24} />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <Routes>
        <Route path="/" element={landing ? <LandingPage /> : <LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot" element={<ForgotPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return <AuthedShell />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Toaster />
        <Routes>
          <Route path="/privacy" element={<PrivacyRoute />} />
          <Route path="/terms" element={<TermsRoute />} />
          <Route path="/cookies" element={<CookiesRoute />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="/changelog" element={<ChangelogPage />} />
          <Route path="/*" element={<AuthGate />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
