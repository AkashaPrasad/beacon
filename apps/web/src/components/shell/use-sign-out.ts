import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { useLogout } from '@/api/me';

/** Sign out, clear every cache, land on the public page. */
export function useSignOut() {
  const logout = useLogout();
  const navigate = useNavigate();
  return () =>
    logout.mutate(undefined, {
      onSettled: () => {
        void navigate('/', { replace: true });
        toast('Signed out.');
      },
    });
}
