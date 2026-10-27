import { Navigate, type RouteObject } from 'react-router';

import { LoginScreen } from '@/features/auth/LoginScreen';
import { publicRoutes } from '@/routes/public';

import {
  OnboardingIndex,
  PublicOnly,
  RequireAuth,
  RequireConsent,
  RequireOnboarded,
} from './guards';
import { RootLayout } from './RootLayout';
import { RouteError } from './RouteError';

/**
 * Route table (React Router 7, data mode). Every signed-in screen is a lazy chunk whose module
 * exports `Component` (+ `handle.title` here). `/` and `/login` are eager: they are prerendered into
 * static HTML at build time (scripts/prerender.mjs) and hydrated. Matching lazy routes are resolved
 * before the router starts (src/app/lazy-routes.ts), so prerendered lazy pages hydrate too.
 *
 * - Marketing/public pages: add them in `src/routes/public.tsx` (spread below), not here.
 * - A new app screen: `src/features/<feature>/<Name>Screen.tsx` exporting `Component`, then a route in
 *   the shell branch below with `lazy: () => import(...)` and a `handle.title`.
 */
const errorElement = <RouteError />;
const shell = () => import('@/components/shell/AppShell');

export const routes: RouteObject[] = [
  {
    id: 'root',
    element: <RootLayout />,
    errorElement,
    children: [
      ...publicRoutes,
      {
        element: <PublicOnly />,
        children: [{ path: 'login', element: <LoginScreen />, handle: { title: 'Sign in' } }],
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
          {
            path: 'welcome',
            lazy: () => import('@/features/auth/WelcomeScreen'),
            handle: { title: 'Before we start' },
            errorElement,
          },
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
          // Ops dashboard: any signed-in account reaches the route; the screen checks `role`
          // (non-admins get the 404 state). Admins needn't finish onboarding to use it.
          {
            lazy: shell,
            errorElement,
            children: [
              {
                path: 'admin',
                lazy: () => import('@/features/admin/AdminScreen'),
                handle: { title: 'Admin' },
                errorElement,
              },
            ],
          },
          {
            element: <RequireOnboarded />,
            children: [
              {
                lazy: shell,
                errorElement,
                children: [
                  {
                    path: 'radar',
                    lazy: () => import('@/features/radar/RadarScreen'),
                    handle: { title: 'Radar' },
                    errorElement,
                  },
                  // Detail views are full pages with Back (page-based navigation, docs/WEB.md §4).
                  {
                    path: 'radar/:listingId',
                    lazy: () => import('@/features/radar/ListingPage'),
                    handle: { title: 'Listing' },
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
                    path: 'tracker/:id',
                    lazy: () => import('@/features/tracker/TrackerItemPage'),
                    handle: { title: 'Tracker' },
                    errorElement,
                  },
                  {
                    path: 'sources',
                    lazy: () => import('@/features/sources/SourcesScreen'),
                    handle: { title: 'Sources' },
                    errorElement,
                  },
                  // The Packs tab of the list (no id).
                  {
                    path: 'sources/packs',
                    lazy: () => import('@/features/sources/SourcesScreen'),
                    handle: { title: 'Sources' },
                    errorElement,
                  },
                  {
                    path: 'sources/packs/:id',
                    lazy: () => import('@/features/sources/PackPage'),
                    handle: { title: 'Source pack' },
                    errorElement,
                  },
                  {
                    path: 'sources/:id',
                    lazy: () => import('@/features/sources/SourcePage'),
                    handle: { title: 'Source' },
                    errorElement,
                  },
                  {
                    path: 'alerts',
                    lazy: () => import('@/features/alerts/AlertsScreen'),
                    handle: { title: 'Alerts' },
                    errorElement,
                  },
                  {
                    path: 'alerts/new',
                    lazy: () => import('@/features/alerts/AlertEditorPage'),
                    handle: { title: 'New alert rule' },
                    errorElement,
                  },
                  {
                    path: 'alerts/:id',
                    lazy: () => import('@/features/alerts/AlertEditorPage'),
                    handle: { title: 'Alert rule' },
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
      {
        path: '*',
        lazy: () => import('@/features/not-found/NotFoundScreen'),
        handle: { title: 'Not found' },
      },
    ],
  },
];
