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
import NotFound from "@/pages/not-found";
import { useEffect, useState } from "react";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const hasSeenSplash = sessionStorage.getItem('hasSeenSplash');
    if (hasSeenSplash) {
      setShowSplash(false);
    }
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

  if (showSplash && !sessionStorage.getItem('hasSeenSplash')) {
    return <Splash />;
  }

  return (
    <Switch>
      {/* Public routes accessible to all */}
      {isLoading || !isAuthenticated ? (
        <>
          <Route path="/" component={Landing} />
          <Route path="/astrologers" component={Astrologers} />
          <Route path="/kundli/matchmaking" component={Matchmaking} />
        </>
      ) : (
        <>
          {/* Authenticated routes */}
          <Route path="/" component={Home} />
          <Route path="/kundli/new" component={KundliNew} />
          <Route path="/kundli/matchmaking" component={Matchmaking} />
          <Route path="/kundli/:id" component={KundliView} />
          <Route path="/astrologers" component={Astrologers} />
          <Route path="/wallet" component={Wallet} />
          <Route path="/chat/:astrologerId" component={Chat} />
          <Route path="/profile" component={Profile} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
