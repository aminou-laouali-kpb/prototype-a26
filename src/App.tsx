import { lazy, Suspense } from 'react';
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
import { Spinner } from './components/ui';

const EmployeesPage = lazy(() => import('./pages/Employees').then((m) => ({ default: m.EmployeesPage })));
const TimePage = lazy(() => import('./pages/Time').then((m) => ({ default: m.TimePage })));
const LeavePage = lazy(() => import('./pages/Leave').then((m) => ({ default: m.LeavePage })));
const TimesheetsPage = lazy(() => import('./pages/Timesheets').then((m) => ({ default: m.TimesheetsPage })));
const PayrollPage = lazy(() => import('./pages/Payroll').then((m) => ({ default: m.PayrollPage })));
const PaymentsPage = lazy(() => import('./pages/Payments').then((m) => ({ default: m.PaymentsPage })));
const PayslipsPage = lazy(() => import('./pages/Payslips').then((m) => ({ default: m.PayslipsPage })));
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })));
const BillingPage = lazy(() => import('./pages/Billing').then((m) => ({ default: m.BillingPage })));
const AuditPage = lazy(() => import('./pages/Audit').then((m) => ({ default: m.AuditPage })));
const BonusesPage = lazy(() => import('./pages/Bonuses').then((m) => ({ default: m.BonusesPage })));
const PerformancePage = lazy(() => import('./pages/Performance').then((m) => ({ default: m.PerformancePage })));
const ProfilePage = lazy(() => import('./pages/Profile').then((m) => ({ default: m.ProfilePage })));

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
        <Suspense fallback={<Spinner label="Chargement…" />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/salaries" element={<RoleRoute roles={PAGE_ROLES.salaries}><EmployeesPage /></RoleRoute>} />
            <Route path="/temps" element={<TimePage />} />
            <Route path="/conges" element={<LeavePage />} />
            <Route path="/feuilles" element={<RoleRoute roles={PAGE_ROLES.feuilles}><TimesheetsPage /></RoleRoute>} />
            <Route path="/paie" element={<RoleRoute roles={PAGE_ROLES.paie}><PayrollPage /></RoleRoute>} />
            <Route path="/primes" element={<RoleRoute roles={PAGE_ROLES.primes}><BonusesPage /></RoleRoute>} />
            <Route path="/performance" element={<RoleRoute roles={PAGE_ROLES.performance}><PerformancePage /></RoleRoute>} />
            <Route path="/paiements" element={<RoleRoute roles={PAGE_ROLES.paiements}><PaymentsPage /></RoleRoute>} />
            <Route path="/bulletins" element={<RoleRoute roles={PAGE_ROLES.bulletins}><PayslipsPage /></RoleRoute>} />
            <Route path="/parametres" element={<RoleRoute roles={PAGE_ROLES.parametres}><SettingsPage /></RoleRoute>} />
            <Route path="/abonnement" element={<RoleRoute roles={PAGE_ROLES.abonnement}><BillingPage /></RoleRoute>} />
            <Route path="/audit" element={<RoleRoute roles={PAGE_ROLES.audit}><AuditPage /></RoleRoute>} />
            <Route path="/profil" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
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
