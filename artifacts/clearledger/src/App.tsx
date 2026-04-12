import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState } from "react";
import "@/lib/auth"; // Initialize auth token getter
import { getToken, getBusinessId, setBusinessId } from "@/lib/auth";
import { getAdminToken } from "@/lib/adminAuth";
import { Layout } from "@/components/Layout";
import { AdminLayout } from "@/components/AdminLayout";
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
import ReceiptsPage from "@/pages/Receipts";
import TaxPackPage from "@/pages/TaxPack";
import SelectBusinessPage from "@/pages/SelectBusiness";
import AdminDashboardPage from "@/pages/admin/AdminDashboard";
import AdminUsersPage from "@/pages/admin/AdminUsers";
import AdminBusinessesPage from "@/pages/admin/AdminBusinesses";
import LandingPage from "@/pages/Landing";
import CustomersPage from "@/pages/Customers";
import InvoicesPage from "@/pages/Invoices";
import QuotesPage from "@/pages/Quotes";
import JobsPage from "@/pages/Jobs";
import VendorsPage from "@/pages/Vendors";
import BillsPage from "@/pages/Bills";
import FleetPage from "@/pages/Fleet";

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
        <Route path="/receipts">
          <ReceiptsPage businessId={businessId} />
        </Route>
        <Route path="/tax-pack">
          <TaxPackPage businessId={businessId} />
        </Route>
        <Route path="/settings">
          <SettingsPage businessId={businessId} onBusinessChange={handleBusinessChange} />
        </Route>
        <Route path="/customers">
          <CustomersPage businessId={businessId} />
        </Route>
        <Route path="/invoices">
          <InvoicesPage businessId={businessId} />
        </Route>
        <Route path="/quotes">
          <QuotesPage businessId={businessId} />
        </Route>
        <Route path="/jobs">
          <JobsPage businessId={businessId} />
        </Route>
        <Route path="/vendors">
          <VendorsPage businessId={businessId} />
        </Route>
        <Route path="/bills">
          <BillsPage businessId={businessId} />
        </Route>
        <Route path="/fleet">
          <FleetPage businessId={businessId} />
        </Route>
        <Route path="/">
          <Redirect to="/dashboard" />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function AdminApp() {
  const adminToken = getAdminToken();
  if (!adminToken) {
    return <Redirect to="/admin/login" />;
  }
  return (
    <AdminLayout>
      <Switch>
        <Route path="/admin/dashboard" component={AdminDashboardPage} />
        <Route path="/admin/users" component={AdminUsersPage} />
        <Route path="/admin/businesses" component={AdminBusinessesPage} />
        <Route path="/admin">
          <Redirect to="/admin/dashboard" />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </AdminLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/admin/login">
        <Redirect to="/login" />
      </Route>
      <Route path="/admin/*">
        <AdminApp />
      </Route>
      <Route path="/admin">
        <AdminApp />
      </Route>
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
