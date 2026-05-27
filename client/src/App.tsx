import { Switch, Route, Redirect } from "wouter";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useAuth } from "@/hooks/useAuth";
import Splash from "@/pages/Splash";
import Landing from "@/pages/Landing";
import Home from "@/pages/Home";
import KundliNew from "@/pages/KundliNew";
import KundliView from "@/pages/KundliView";
import MyCharts from "@/pages/MyCharts";
import Matchmaking from "@/pages/Matchmaking";
import Prashna from "@/pages/Prashna";
import PatternMatcher from "@/pages/PatternMatcher";
import Astrologers from "@/pages/Astrologers";
import Wallet from "@/pages/Wallet";
import Chat from "@/pages/Chat";
import Profile from "@/pages/Profile";
import CallRoom from "@/pages/CallRoom";
import Schedule from "@/pages/Schedule";
import AstrologerLogin from "@/pages/AstrologerLogin";
import AstrologerDashboard from "@/pages/AstrologerDashboard";
import AdminLogin from "@/pages/AdminLogin";
import AdminDashboard from "@/pages/AdminDashboard";
import Numerology from "@/pages/Numerology";
import Horoscope from "@/pages/Horoscope";
import AIAstrologer from "@/pages/AIAstrologer";
import Store from "@/pages/Store";
import Reports from "@/pages/Reports";
import Pooja from "@/pages/Pooja";
import Live from "@/pages/Live";
import LiveStream from "@/pages/LiveStream";
import LiveStudio from "@/pages/LiveStudio";
import Panchang from "@/pages/Panchang";
import Remedies from "@/pages/Remedies";
import NotFound from "@/pages/not-found";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { initAnalytics, trackEvent, identifyUser } from "@/lib/analytics";
import { enablePushNotifications, type FirebaseConfig } from "@/lib/push";

function Router() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [showSplash, setShowSplash] = useState(true);

  // Initialize PostHog from server config
  const { data: config } = useQuery<{ posthogKey?: string; firebase?: FirebaseConfig }>({
    queryKey: ["/api/config"],
    refetchOnWindowFocus: false,
  });

  // Register for web push once authenticated (no-op if Firebase unconfigured,
  // unsupported, or the user has already declined permission).
  useEffect(() => {
    if (isAuthenticated && config?.firebase?.projectId && Notification?.permission !== 'denied') {
      enablePushNotifications(config.firebase);
    }
  }, [isAuthenticated, config?.firebase?.projectId]);

  useEffect(() => {
    if (config?.posthogKey) {
      initAnalytics(config.posthogKey);
      if (user) {
        identifyUser((user as any).id?.toString(), { name: (user as any).name, email: (user as any).email, role: (user as any).role });
      }
    }
  }, [config?.posthogKey, user]);

  // Track page views
  useEffect(() => {
    trackEvent('$pageview');
  }, [window.location.pathname]);

  useEffect(() => {
    const hasSeenSplash = sessionStorage.getItem('hasSeenSplash');
    if (hasSeenSplash) setShowSplash(false);
  }, []);

  useEffect(() => {
    if (showSplash) {
      const timer = setTimeout(() => {
        setShowSplash(false);
        sessionStorage.setItem('hasSeenSplash', 'true');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showSplash]);

  if (showSplash && !sessionStorage.getItem('hasSeenSplash')) return <Splash />;

  return (
    <Switch>
      {/* Astrologer portal — always accessible */}
      <Route path="/astrologer/login" component={AstrologerLogin} />
      <Route path="/astrologer/dashboard" component={AstrologerDashboard} />
      <Route path="/astrologer/live" component={LiveStudio} />

      {/* Admin login — always accessible (works logged in or out) */}
      <Route path="/admin/login" component={AdminLogin} />

      {/* Public routes — accessible without login */}
      <Route path="/horoscope" component={Horoscope} />
      <Route path="/horoscope/:sign" component={Horoscope} />
      <Route path="/astrologers" component={Astrologers} />
      <Route path="/kundli/matchmaking" component={Matchmaking} />
      <Route path="/prashna" component={Prashna} />
      <Route path="/kundli" component={MyCharts} />
      <Route path="/kundli/new" component={KundliNew} />
      <Route path="/kundli/:id" component={KundliView} />
      <Route path="/numerology" component={Numerology} />
      <Route path="/ai-astrologer" component={AIAstrologer} />
      <Route path="/store" component={Store} />
      <Route path="/reports" component={Reports} />
      <Route path="/pooja" component={Pooja} />
      <Route path="/live" component={Live} />
      <Route path="/live/:id" component={LiveStream} />
      <Route path="/panchang" component={Panchang} />
      <Route path="/remedies" component={Remedies} />

      {isLoading || !isAuthenticated ? (
        <>
          <Route path="/" component={Landing} />
          <Route path="/astrologer/login" component={AstrologerLogin} />
          {/* Admin URLs while logged out: show the login form instead of 404 */}
          <Route path="/admin" component={Landing} />
          <Route path="/admin/dashboard" component={Landing} />
          <Route path="/admin/patterns" component={Landing} />
        </>
      ) : (
        <>
          {/* Authenticated user routes */}
          <Route path="/" component={Home} />
          <Route path="/wallet" component={Wallet} />
          <Route path="/chat/:astrologerId" component={Chat} />
          <Route path="/call/:astrologerId" component={CallRoom} />
          <Route path="/schedule" component={Schedule} />
          <Route path="/profile" component={Profile} />
          <Route path="/admin">{() => <Redirect to="/admin/dashboard" />}</Route>
          <Route path="/admin/dashboard" component={AdminDashboard} />
          <Route path="/admin/patterns" component={PatternMatcher} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}
import BottomNav from "@/components/BottomNav";
import TopNav from "@/components/TopNav";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <div className="min-h-screen bg-background">
            <TopNav />
            <div className="pb-20 md:pb-0">
              <Router />
            </div>
            <BottomNav />
          </div>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
