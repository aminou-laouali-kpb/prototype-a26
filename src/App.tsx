import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SessionProvider, useSession } from './lib/session';
import { Layout } from './components/Layout';
import AuthScreen from './components/AuthScreen';
import { OrgGate } from './components/OrgGate';
import { RoleRoute } from './components/RoleRoute';
import { WorkSessionProvider } from './lib/workSessionContext';
import { PAGE_ROLES } from './lib/access';
import { Dashboard } from './pages/Dashboard';
import { EmployeeHome } from './pages/EmployeeHome';
import { EmployeesPage } from './pages/Employees';
import { TimePage } from './pages/Time';
import { LeavePage } from './pages/Leave';
import { TimesheetsPage } from './pages/Timesheets';
import { PayrollPage } from './pages/Payroll';
import { PaymentsPage } from './pages/Payments';
import { PayslipsPage } from './pages/Payslips';
import { SettingsPage } from './pages/Settings';
import { BillingPage } from './pages/Billing';
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
          <Route path="/salaries" element={<RoleRoute roles={PAGE_ROLES.salaries}><EmployeesPage /></RoleRoute>} />
          <Route path="/temps" element={<TimePage />} />
          <Route path="/conges" element={<LeavePage />} />
          <Route path="/feuilles" element={<RoleRoute roles={PAGE_ROLES.feuilles}><TimesheetsPage /></RoleRoute>} />
          <Route path="/paie" element={<RoleRoute roles={PAGE_ROLES.paie}><PayrollPage /></RoleRoute>} />
          <Route path="/paiements" element={<RoleRoute roles={PAGE_ROLES.paiements}><PaymentsPage /></RoleRoute>} />
          <Route path="/bulletins" element={<RoleRoute roles={PAGE_ROLES.bulletins}><PayslipsPage /></RoleRoute>} />
          <Route path="/parametres" element={<RoleRoute roles={PAGE_ROLES.parametres}><SettingsPage /></RoleRoute>} />
          <Route path="/abonnement" element={<RoleRoute roles={PAGE_ROLES.abonnement}><BillingPage /></RoleRoute>} />
          <Route path="/audit" element={<RoleRoute roles={PAGE_ROLES.audit}><AuditPage /></RoleRoute>} />
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
