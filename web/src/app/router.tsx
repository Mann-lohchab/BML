import { createBrowserRouter } from 'react-router';
import { AppShell } from '@/app/AppShell';
import { ProtectedRoute } from '@/app/ProtectedRoute';
import { CoachDetailPage } from '@/pages/CoachDetailPage';
import { CoachesPage } from '@/pages/CoachesPage';
import { ContactsPage } from '@/pages/ContactsPage';
import { DevicesPage } from '@/pages/DevicesPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { OverviewPage } from '@/pages/OverviewPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { TriggersPage } from '@/pages/TriggersPage';

export const router = createBrowserRouter([
  { path: '/login', Component: LoginPage },
  { path: '/forgot-password', Component: ForgotPasswordPage },
  { path: '/reset-password', Component: ResetPasswordPage },
  {
    Component: ProtectedRoute,
    children: [
      {
        path: '/',
        Component: AppShell,
        children: [
          { index: true, Component: OverviewPage },
          { path: 'coaches', Component: CoachesPage },
          { path: 'coaches/:coachId', Component: CoachDetailPage },
          { path: 'devices', Component: DevicesPage },
          { path: 'contacts', Component: ContactsPage },
          { path: 'notifications', Component: NotificationsPage },
          { path: 'triggers', Component: TriggersPage },
          { path: 'reports', Component: ReportsPage },
          { path: '*', Component: NotFoundPage }
        ]
      }
    ]
  }
]);
