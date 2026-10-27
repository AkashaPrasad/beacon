import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';

import { queryKeys } from '@/api/keys';
import { setUnauthorizedHandler } from '@/lib/api';
import { sessionHint } from '@/lib/storage';

const PUBLIC = /^\/($|login|auth\/)/;

/** Any 401 from a signed-in request clears the session and sends the user to /login?next=<here>. */
export function useUnauthorizedRedirect() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  useEffect(() => {
    setUnauthorizedHandler(() => {
      sessionHint.set(false);
      qc.setQueryData(queryKeys.me, null);
      const { pathname, search } = window.location;
      if (PUBLIC.test(pathname)) return;
      void navigate(`/login?next=${encodeURIComponent(pathname + search)}`, { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate, qc]);
}
