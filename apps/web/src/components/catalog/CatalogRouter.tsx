import { useLocation } from 'react-router-dom';
import { PlacesDirectory, PlacePage, CorridorPage, CoveragePage, AreaPage, AreasIndex } from './PlacesPages';
import { MonthPage, WeekPage, OnThisDayPage, GapsPage } from './TimePages';
import { TripStoryPage, TripBuilderPage, HolidaysPage, CommutePage, WeekdayPage } from './TripPages';
import { FirstsPage, MovingPage, AnomalyPage, ChaptersPage, BadgesPage, GuessesPage } from './LifePages';
import { OnboardingPage, ImportsPage, HealthPage, AdminPage, UpdatesPage } from './OpsPages';
import { ComparePage, ReplayPage } from './CompareReplay';
import GlobeView from './GlobeView';
import CatalogPage from './CatalogPage';
import YearReviewView from '../YearReviewView';

export default function CatalogRouter() {
  const { pathname } = useLocation();

  if (pathname === '/places') return <PlacesDirectory />;
  if (pathname.startsWith('/places/')) return <PlacePage />;
  if (pathname.startsWith('/corridors/')) return <CorridorPage />;
  if (pathname === '/coverage') return <CoveragePage />;
  if (pathname === '/areas') return <AreasIndex />;
  if (pathname.startsWith('/areas/')) return <AreaPage />;
  if (pathname === '/compare') return <ComparePage />;
  if (pathname === '/replay') return <ReplayPage />;
  if (pathname.startsWith('/month/')) return <MonthPage />;
  if (pathname.startsWith('/week/')) return <WeekPage />;
  if (pathname === '/on-this-day') return <OnThisDayPage />;
  if (pathname === '/gaps') return <GapsPage />;
  if (pathname === '/review' || pathname.startsWith('/review/')) return <YearReviewView />;
  if (pathname === '/trips/new') return <TripBuilderPage />;
  if (/^\/trips\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/.test(pathname)) return <TripStoryPage />;
  if (pathname === '/holidays') return <HolidaysPage />;
  if (pathname === '/commute') return <CommutePage />;
  if (pathname === '/weekday') return <WeekdayPage />;
  if (pathname === '/firsts') return <FirstsPage />;
  if (pathname === '/moving') return <MovingPage />;
  if (pathname === '/anomaly') return <AnomalyPage />;
  if (pathname === '/chapters') return <ChaptersPage />;
  if (pathname === '/onboarding') return <OnboardingPage />;
  if (pathname === '/imports') return <ImportsPage />;
  if (pathname === '/health') return <HealthPage />;
  if (pathname === '/admin') return <AdminPage />;
  if (pathname === '/updates') return <UpdatesPage />;
  if (pathname === '/badges') return <BadgesPage />;
  if (pathname === '/guesses') return <GuessesPage />;
  if (pathname === '/globe') return <GlobeView />;

  return (
    <CatalogPage title="Explore">
      <p className="text-sm text-text-muted">This page is not available.</p>
    </CatalogPage>
  );
}
