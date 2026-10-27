import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resetMocks, server } from '@/mocks/server';

import { PublicOnly, RequireAuth, RequireOnboarded } from './guards';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  localStorage.clear();
  resetMocks();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function Where({ label }: { label: string }) {
  const location = useLocation();
  return <p data-testid="where">{`${label} ${location.pathname}${location.search}`}</p>;
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        element: <PublicOnly />,
        children: [
          { path: '/', element: <Where label="landing" /> },
          { path: '/login', element: <Where label="login" /> },
        ],
      },
      { path: '/welcome', element: <Where label="welcome" /> },
      { path: '/onboarding/:step', element: <Where label="onboarding" /> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <RequireOnboarded />,
            children: [
              { path: '/radar', element: <Where label="radar" /> },
              { path: '/tracker', element: <Where label="tracker" /> },
            ],
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const unauthenticated = () =>
  HttpResponse.json(
    { error: { code: 'UNAUTHENTICATED', message: 'Sign in', details: { reason: 'missing' } } },
    { status: 401 },
  );

describe('RequireAuth', () => {
  it('shows the shell skeleton while /v1/me resolves, then the screen for a signed-in user', async () => {
    renderAt('/radar');
    expect(screen.getByText('Loading Beacon')).toBeInTheDocument();
    expect(await screen.findByTestId('where')).toHaveTextContent('radar /radar');
    // The session hint lets public pages ask /v1/me next time.
    expect(localStorage.getItem('beacon:session')).toBe('true');
  });

  it('sends anonymous visitors to /login with the path they wanted', async () => {
    server.use(http.get('*/v1/me', unauthenticated));
    renderAt('/tracker?view=table');
    expect(await screen.findByTestId('where')).toHaveTextContent(
      `login /login?next=${encodeURIComponent('/tracker?view=table')}`,
    );
  });

  it('offers a retry instead of a blank page when the API is down', async () => {
    server.use(
      http.get('*/v1/me', () =>
        HttpResponse.json(
          { error: { code: 'SERVICE_UNAVAILABLE', message: 'Mongo is down' } },
          { status: 503 },
        ),
      ),
    );
    renderAt('/radar');
    expect(await screen.findByRole('alert')).toHaveTextContent('Mongo is down');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('RequireOnboarded and PublicOnly', () => {
  it('routes a user without consent to /welcome', async () => {
    localStorage.setItem('beacon:mock:user', 'consent');
    resetMocks();
    renderAt('/radar');
    expect(await screen.findByTestId('where')).toHaveTextContent('welcome /welcome');
  });

  it('redirects a signed-in visitor away from /login to the safe `next` path', async () => {
    localStorage.setItem('beacon:session', 'true');
    renderAt(`/login?next=${encodeURIComponent('/tracker')}`);
    // The public page renders at once (it is prerendered); the redirect follows when /v1/me answers.
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('tracker /tracker'));
  });

  it('ignores an off-site `next` and lands on the radar', async () => {
    localStorage.setItem('beacon:session', 'true');
    renderAt(`/login?next=${encodeURIComponent('//evil.example/phish')}`);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('radar /radar'));
  });

  it('never calls /v1/me for anonymous visitors on public pages', async () => {
    let calls = 0;
    server.use(
      http.get('*/v1/me', () => {
        calls += 1;
        return unauthenticated();
      }),
    );
    renderAt('/');
    expect(await screen.findByTestId('where')).toHaveTextContent('landing /');
    expect(calls).toBe(0);
  });
});
