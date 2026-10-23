import { lazy, Suspense, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { usePublicConfig } from './hooks/useApi';
import { useSession } from './lib/auth';
import LoginPage from './components/auth/LoginPage';
import SignupPage from './components/auth/SignupPage';
import ForgotPage from './components/auth/ForgotPage';
import ResetPasswordPage from './components/auth/ResetPasswordPage';
import { CookiesRoute, PrivacyRoute, TermsRoute } from './components/legal/LegalRoutes';
import LandingPage from './components/marketing/LandingPage';
import PricingPage from './components/marketing/PricingPage';
import StatusPage from './components/marketing/StatusPage';
import ChangelogPage from './components/marketing/ChangelogPage';
import { Toaster } from './components/ui/sonner';
import { Loader2 } from 'lucide-react';

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

const AuthedApp = lazy(() => import('./AuthedApp'));

function bootFallback() {
  return (
    <div className="flex h-dvh w-screen items-center justify-center bg-bg text-text-muted">
      <Loader2 className="animate-spin text-accent" size={24} />
    </div>
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

  // Only the first session check shows the spinner. Better Auth re-checks the session
  // after sign-up and sign-in requests; swapping the page out then threw away the
  // sign-up and login forms (their "enter the code" step) so the page looked like it
  // refreshed and lost what was typed.
  const [sessionLoadedOnce, setSessionLoadedOnce] = useState(false);
  if (!isPending && !sessionLoadedOnce) setSessionLoadedOnce(true);
  const firstLoad = !sessionLoadedOnce;

  if ((firstLoad && isPending) || (!session?.user && configPending)) {
    return bootFallback();
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

  return (
    <Suspense fallback={bootFallback()}>
      <AuthedApp />
    </Suspense>
  );
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
