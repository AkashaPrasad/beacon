import { Router } from 'express';

import type { AppContext } from '../context.js';
import { requireRole } from '../middleware/auth.js';
import { adminOverview } from '../services/admin.js';

/** Mounted under /v1 behind `requireAuth` (prefix `/admin`). */
export function createAdminRouter(ctx: AppContext): Router {
  const router = Router();
  router.get('/admin/overview', requireRole('admin'), async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await adminOverview(ctx));
  });
  return router;
}
