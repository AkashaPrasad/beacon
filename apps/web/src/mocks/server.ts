/**
 * MSW for Vitest (node): the same handlers as the browser mock.
 *
 *   import { server } from '@/mocks/server';      // started by src/test/setup.ts
 *   server.use(http.get('*\/v1/me', () => HttpResponse.json(null, { status: 401 })));
 */
import { setupServer } from 'msw/node';

import { handlers } from './handlers';

export const server = setupServer(...handlers);
export { resetMocks } from './handlers';
