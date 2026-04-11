import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import "@/lib/auth"; // Initialize auth token getter
import { getToken, getBusinessId, setBusinessId } from "@/lib/auth";
import { Layout } from "@/components/Layout";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/Login";
import RegisterPage from "@/pages/Register";
import DashboardPage from "@/pages/Dashboard";
import AccountsPage from "@/pages/Accounts";
import TransactionsPage from "@/pages/Transactions";
import JournalPage from "@/pages/Journal";
import ReconcilePage from "@/pages/Reconcile";
import ReportsPage from "@/pages/Reports";
import UploadPage from "@/pages/Upload";
import SettingsPage from "@/pages/Settings";
import SelectBusinessPage from "@/pages/SelectBusiness";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function ProtectedApp() {
  const token = getToken();
  const [businessId, setCurrentBusinessId] = useState<number | null>(getBusinessId());

  if (!token) {
    return <Redirect to="/login" />;
  }

  if (!businessId) {
    return (
      <SelectBusinessPage
        onBusinessSelected={(id) => {
          setBusinessId(id);
          setCurrentBusinessId(id);
        }}
      />
    );
  }

  function handleBusinessChange(id: number) {
    setCurrentBusinessId(id);
  }

  return (
    <Layout businessId={businessId} onBusinessChange={handleBusinessChange}>
      <Switch>
        <Route path="/dashboard">
          <DashboardPage businessId={businessId} />
        </Route>
        <Route path="/accounts">
          <AccountsPage businessId={businessId} />
        </Route>
        <Route path="/transactions">
          <TransactionsPage businessId={businessId} />
        </Route>
        <Route path="/journal">
          <JournalPage businessId={businessId} />
        </Route>
        <Route path="/reconcile">
          <ReconcilePage businessId={businessId} />
        </Route>
        <Route path="/reports">
          <ReportsPage businessId={businessId} />
        </Route>
        <Route path="/upload">
          <UploadPage businessId={businessId} />
        </Route>
        <Route path="/settings">
          <SettingsPage businessId={businessId} onBusinessChange={handleBusinessChange} />
        </Route>
        <Route path="/">
          <Redirect to="/dashboard" />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/*">
        <ProtectedApp />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
