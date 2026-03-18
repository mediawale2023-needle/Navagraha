import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
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
import Matchmaking from "@/pages/Matchmaking";
import Astrologers from "@/pages/Astrologers";
import Wallet from "@/pages/Wallet";
import Chat from "@/pages/Chat";
import Profile from "@/pages/Profile";
import CallRoom from "@/pages/CallRoom";
import Schedule from "@/pages/Schedule";
import AstrologerLogin from "@/pages/AstrologerLogin";
import AstrologerDashboard from "@/pages/AstrologerDashboard";
import AdminDashboard from "@/pages/AdminDashboard";
import Numerology from "@/pages/Numerology";
import AIAstrologer from "@/pages/AIAstrologer";
import Horoscope from "@/pages/Horoscope";
import NotFound from "@/pages/not-found";
import { useEffect, useState } from "react";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const [showSplash, setShowSplash] = useState(true);

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

      {/* Admin / Developer dashboard — always accessible */}
      <Route path="/admin/dashboard" component={AdminDashboard} />

      {/* Public routes — accessible without login */}
      <Route path="/horoscope" component={Horoscope} />
      <Route path="/horoscope/:sign" component={Horoscope} />
      <Route path="/astrologers" component={Astrologers} />
      <Route path="/kundli/matchmaking" component={Matchmaking} />
      <Route path="/numerology" component={Numerology} />

      {isLoading || !isAuthenticated ? (
        <>
          <Route path="/" component={Landing} />
          <Route path="/astrologer/login" component={AstrologerLogin} />
        </>
      ) : (
        <>
          {/* Authenticated user routes */}
          <Route path="/" component={Home} />
          <Route path="/kundli/new" component={KundliNew} />
          <Route path="/kundli/:id" component={KundliView} />
          <Route path="/wallet" component={Wallet} />
          <Route path="/chat/:astrologerId" component={Chat} />
          <Route path="/call/:astrologerId" component={CallRoom} />
          <Route path="/schedule" component={Schedule} />
          <Route path="/profile" component={Profile} />
          <Route path="/ai-astrologer" component={AIAstrologer} />
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
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <div className="min-h-screen celestial-bg">
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
