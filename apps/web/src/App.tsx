import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ApiError } from './api/client';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoadingState, ToastProvider } from './components/ui';
import { AppLayout } from './layout/AppLayout';
import { AgenciesPage, AgencyDetailPage } from './pages/Agencies';
import { AuditPage, RolesPage, SettingsPage, UsersPage } from './pages/Admin';
import { CustomersPage, ProductsPage } from './pages/Commercial';
import { CalendarPage } from './pages/Calendar';
import { DashboardPage } from './pages/Dashboard';
import { LoginPage } from './pages/Login';
import { ManagerDetailPage, ManagersPage } from './pages/Managers';
import { ForbiddenPage, InformationPage, NotFoundPage, ReportsPage } from './pages/Misc';
import { CardDetailPage, CardsPage, CurrencyPage, LotDetailPage, LotsPage } from './pages/Operations';
import { MyActivityPage } from './pages/MyActivity';
import { ProfilePage } from './pages/Profile';
import { ProspectDetailPage, ProspectsPage } from './pages/Prospects';
import { VisitDetailPage, VisitsPage } from './pages/Visits';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState label="Cargando sesión…" />;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

/** Sólo UX. El backend aplica la autorización real. */
function Guard({ permission, children }: { permission: string; children: ReactNode }) {
  const { can } = useAuth();
  return can(permission) ? <>{children}</> : <ForbiddenPage />;
}

const g = (permission: string, el: ReactNode) => <Guard permission={permission}>{el}</Guard>;

function Home() {
  const { can, user } = useAuth();
  if (user?.managerId && can('visits.read')) return <MyActivityPage />;
  return can('dashboard.read') ? <DashboardPage /> : <InformationPage />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<Protected><AppLayout /></Protected>}>
                <Route index element={<Home />} />
                <Route path="agencies" element={g('agencies.read', <AgenciesPage />)} />
                <Route path="agencies/:id" element={g('agencies.read', <AgencyDetailPage />)} />
                <Route path="managers" element={g('managers.read', <ManagersPage />)} />
                <Route path="managers/:id" element={g('managers.read', <ManagerDetailPage />)} />
                <Route path="visits" element={g('visits.read', <VisitsPage />)} />
                <Route path="visits/:id" element={g('visits.read', <VisitDetailPage />)} />
                <Route path="prospects" element={g('prospects.read', <ProspectsPage />)} />
                <Route path="prospects/:id" element={g('prospects.read', <ProspectDetailPage />)} />
                <Route path="dashboard" element={g('dashboard.read', <DashboardPage />)} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="customers" element={g('customers.read', <CustomersPage />)} />
                <Route path="products" element={g('products.read', <ProductsPage />)} />
                <Route path="calendar" element={g('visits.read', <CalendarPage />)} />
                <Route path="currency" element={g('currency.read', <CurrencyPage />)} />
                <Route path="lots" element={g('lots.read', <LotsPage />)} />
                <Route path="lots/:id" element={g('lots.read', <LotDetailPage />)} />
                <Route path="cards" element={g('cards.read', <CardsPage />)} />
                <Route path="cards/:id" element={g('cards.read', <CardDetailPage />)} />
                <Route path="reports" element={g('reports.read', <ReportsPage />)} />
                <Route path="information" element={g('goals.read', <InformationPage />)} />
                <Route path="users" element={g('users.read', <UsersPage />)} />
                <Route path="roles" element={g('roles.read', <RolesPage />)} />
                <Route path="settings" element={g('config.read', <SettingsPage />)} />
                <Route path="audit" element={g('audit.read', <AuditPage />)} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
