import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SessionProvider, useSession } from './lib/session';
import { Layout } from './components/Layout';
import AuthScreen from './components/AuthScreen';
import { OrgGate } from './components/OrgGate';
import { WorkSessionProvider } from './lib/workSessionContext';
import { Dashboard } from './pages/Dashboard';
import { EmployeeHome } from './pages/EmployeeHome';
import { EmployeesPage } from './pages/Employees';
import { TimePage } from './pages/Time';
import { LeavePage } from './pages/Leave';
import { TimesheetsPage } from './pages/Timesheets';
import { PayrollPage } from './pages/Payroll';
import { PayslipsPage } from './pages/Payslips';
import { SettingsPage } from './pages/Settings';
import { AuditPage } from './pages/Audit';
import { ProfilePage } from './pages/Profile';
import { Spinner } from './components/ui';

function Shell() {
  const { session, loading, activeOrg, activeRole } = useSession();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Spinner label="Ouverture de votre espace…" />
      </div>
    );
  }
  if (!session) return <AuthScreen />;
  if (!activeOrg) return <OrgGate />;

  const Home = activeRole === 'employee' ? EmployeeHome : Dashboard;

  return (
    <WorkSessionProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/salaries" element={<EmployeesPage />} />
          <Route path="/temps" element={<TimePage />} />
          <Route path="/conges" element={<LeavePage />} />
          <Route path="/feuilles" element={<TimesheetsPage />} />
          <Route path="/paie" element={<PayrollPage />} />
          <Route path="/bulletins" element={<PayslipsPage />} />
          <Route path="/parametres" element={<SettingsPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/profil" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </WorkSessionProvider>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </SessionProvider>
  );
}
