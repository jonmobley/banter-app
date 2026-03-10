import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/home";
import Mobley from "@/pages/mobley";
import Account from "@/pages/account";
import Contacts from "@/pages/contacts";
import Schedule from "@/pages/schedule";
import Admin from "@/pages/admin";
import NotFound from "@/pages/not-found";

const isNativeApp = typeof (window as any).Capacitor !== 'undefined';

function Router() {
  return (
    <Switch>
      <Route path="/">{isNativeApp ? <Redirect to="/login" /> : <Home />}</Route>
      <Route path="/login" component={Mobley} />
      <Route path="/mobley"><Redirect to="/login" /></Route>
      <Route path="/join/:slug">{(params) => <Mobley slug={params.slug} />}</Route>
      <Route path="/account" component={Account} />
      <Route path="/contacts" component={Contacts} />
      <Route path="/schedule" component={Schedule} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
