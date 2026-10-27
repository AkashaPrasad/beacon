import { RotateCw, TriangleAlert } from 'lucide-react';
import { isRouteErrorResponse, useLocation, useNavigate, useRouteError } from 'react-router';

import { Button } from '@/components/ui/button';
import { errorMessage, isApiError } from '@/lib/api';

const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

/**
 * Per-route error boundary (DESIGN §8 rule 5: what failed, why, the fix + Retry). A stale chunk after a
 * deploy reloads the page; anything else re-mounts the route.
 */
export function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();
  const location = useLocation();
  const stale = error instanceof Error && CHUNK_ERROR.test(error.message);
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const requestId = isApiError(error) ? error.requestId : null;

  const retry = () => {
    if (stale) window.location.reload();
    else
      void navigate(`${location.pathname}${location.search}`, {
        replace: true,
        state: { retry: Date.now() },
      });
  };

  return (
    <div
      data-testid="route-error"
      role="alert"
      className="mx-auto flex max-w-prose flex-col items-center gap-3 px-gutter py-16 text-center"
    >
      <div className="grid size-10 place-items-center rounded-md bg-surface-sunken text-fg-secondary">
        <TriangleAlert className="size-5" strokeWidth={1.5} aria-hidden="true" />
      </div>
      <h1 className="text-h2 text-fg">
        {stale
          ? 'Beacon was updated.'
          : notFound
            ? "This page doesn't exist."
            : "Couldn't load this page."}
      </h1>
      <p className="text-body text-fg-secondary">
        {stale
          ? 'Reload to get the latest version. Nothing you saved is lost.'
          : notFound
            ? 'Check the address, or go back to your radar.'
            : errorMessage(
                error,
                'Something broke while rendering this page. Retrying usually fixes it.',
              )}
      </p>
      <div className="flex gap-2">
        <Button variant="primary" onClick={retry}>
          <RotateCw strokeWidth={1.5} /> {stale ? 'Reload' : 'Retry'}
        </Button>
        <Button variant="ghost" onClick={() => void navigate('/radar')}>
          Go to Radar
        </Button>
      </div>
      {requestId && (
        <button
          type="button"
          className="text-caption text-fg-tertiary underline-offset-3 hover:underline"
          onClick={() => void navigator.clipboard?.writeText(requestId)}
        >
          Copy error details
        </button>
      )}
    </div>
  );
}
