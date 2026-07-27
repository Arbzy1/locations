import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TabId } from './types';
import { useRouteProgress } from './hooks/useApi';
import { useSession, signOut } from './lib/auth';
import HotspotsView from './components/HotspotsView';
import DayView from './components/DayView';
import DayTripsView from './components/DayTripsView';
import InsightsView from './components/InsightsView';
import LoginPage from './components/LoginPage';
import {
  Flame,
  Calendar,
  Compass,
  TrendingUp,
  Loader2,
  LogOut,
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

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'hotspots', label: 'Hotspots', icon: <Flame size={18} /> },
  { id: 'day', label: 'Day View', icon: <Calendar size={18} /> },
  { id: 'trips', label: 'Day Trips', icon: <Compass size={18} /> },
  { id: 'insights', label: 'Insights', icon: <TrendingUp size={18} /> },
];

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabId>('hotspots');
  const [dayViewDate, setDayViewDate] = useState('');
  const { data: routeProgress } = useRouteProgress();
  const { data: session } = useSession();

  const handleSelectDate = (date: string) => {
    setDayViewDate(date);
    setActiveTab('day');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg">
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
          >
            {tab.icon}
          </button>
        ))}

        <div className="mt-auto flex flex-col items-center gap-2">
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
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'hotspots' && <HotspotsView />}
        {activeTab === 'day' && <DayView initialDate={dayViewDate} />}
        {activeTab === 'trips' && <DayTripsView onSelectDate={handleSelectDate} />}
        {activeTab === 'insights' && <InsightsView />}
      </div>
    </div>
  );
}

function AuthGate() {
  const { data: session, isPending } = useSession();

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
