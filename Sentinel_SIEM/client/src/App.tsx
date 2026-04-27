import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { AdminPage } from "./pages/AdminPage";
import { AlertsPage } from "./pages/AlertsPage";
import { CasesPage } from "./pages/CasesPage";
import { DashboardBuilderPage } from "./pages/DashboardBuilderPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EndpointsPage } from "./pages/EndpointsPage";
import { IngestionPage } from "./pages/IngestionPage";
import { LoginPage } from "./pages/LoginPage";
import { RulesPage } from "./pages/RulesPage";
import { SearchPage } from "./pages/SearchPage";
import { SettingsPage } from "./pages/SettingsPage";

export function App() {
  const { user, loading, hasPermission } = useAuth();

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-ink-950 text-sm text-slate-300">Loading</div>;
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/ingest" element={hasPermission("events:write") ? <IngestionPage /> : <Navigate to="/" replace />} />
        <Route path="/endpoints" element={hasPermission("agents:read") ? <EndpointsPage /> : <Navigate to="/" replace />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/cases" element={<CasesPage />} />
        <Route path="/dashboards" element={<DashboardBuilderPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/admin" element={hasPermission("admin:manage") ? <AdminPage /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
