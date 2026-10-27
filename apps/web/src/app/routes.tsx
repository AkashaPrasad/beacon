import { Navigate, type RouteObject } from 'react-router';

import { LoginScreen } from '@/features/auth/LoginScreen';
import { LandingScreen } from '@/features/landing/LandingScreen';

import { OnboardingIndex, PublicOnly, RequireAuth, RequireConsent, RequireOnboarded } from './guards';
import { RootLayout } from './RootLayout';
import { RouteError } from './RouteError';

/**
 * Route table (React Router 7, data mode). Every signed-in screen is a lazy chunk whose module
 * exports `Component`. Landing and login are eager: they are prerendered into static HTML at build time
 * (scripts/prerender.mjs) and hydrated, which is what keeps Lighthouse ≥ 95 on them.
 *
 * To add a screen: create `src/features/<feature>/<Name>Screen.tsx` exporting `Component`, then add a
 * route below with `lazy: () => import(...)` and a `handle.title`.
 */
const errorElement = <RouteError />;

export const routes: RouteObject[] = [
  {
    id: 'root',
    element: <RootLayout />,
    errorElement,
    children: [
      {
        element: <PublicOnly />,
        children: [
          { index: true, element: <LandingScreen />, handle: { title: null } },
          { path: 'login', element: <LoginScreen />, handle: { title: 'Sign in' } },
        ],
      },
      {
        path: 'auth/callback',
        lazy: () => import('@/features/auth/AuthCallbackScreen'),
        handle: { title: 'Signing in' },
        errorElement,
      },
      {
        element: <RequireAuth />,
        errorElement,
        children: [
          { path: 'welcome', lazy: () => import('@/features/auth/WelcomeScreen'), handle: { title: 'Before we start' }, errorElement },
          { path: 'onboarding', element: <OnboardingIndex /> },
          {
            element: <RequireConsent />,
            children: [
              {
                path: 'onboarding/:step',
                lazy: () => import('@/features/onboarding/OnboardingScreen'),
                handle: { title: 'Set up your radar' },
                errorElement,
              },
            ],
          },
          {
            element: <RequireOnboarded />,
            children: [
              {
                lazy: () => import('@/components/shell/AppShell'),
                errorElement,
                children: [
                  {
                    path: 'radar/:listingId?',
                    lazy: () => import('@/features/radar/RadarScreen'),
                    handle: { title: 'Radar' },
                    errorElement,
                  },
                  {
                    path: 'deadlines',
                    lazy: () => import('@/features/deadlines/DeadlinesScreen'),
                    handle: { title: 'Deadlines' },
                    errorElement,
                  },
                  {
                    path: 'tracker',
                    lazy: () => import('@/features/tracker/TrackerScreen'),
                    handle: { title: 'Tracker' },
                    errorElement,
                  },
                  {
                    path: 'sources',
                    lazy: () => import('@/features/sources/SourcesScreen'),
                    handle: { title: 'Sources' },
                    errorElement,
                  },
                  {
                    path: 'alerts',
                    lazy: () => import('@/features/alerts/AlertsScreen'),
                    handle: { title: 'Alerts' },
                    errorElement,
                  },
                  {
                    path: 'profile',
                    lazy: () => import('@/features/profile/ProfileScreen'),
                    handle: { title: 'Profile' },
                    errorElement,
                  },
                  { path: 'settings', element: <Navigate to="/settings/appearance" replace /> },
                  {
                    path: 'settings/:tab',
                    lazy: () => import('@/features/settings/SettingsScreen'),
                    handle: { title: 'Settings' },
                    errorElement,
                  },
                  {
                    path: 'notifications',
                    lazy: () => import('@/features/notifications/NotificationsScreen'),
                    handle: { title: 'Notifications' },
                    errorElement,
                  },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', lazy: () => import('@/features/not-found/NotFoundScreen'), handle: { title: 'Not found' } },
    ],
  },
];
