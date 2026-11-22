// /api/admin — the owner's panel: numbers, customers, the team and payouts, prices and contact details.
// Only the administrator account (or the single local learner) can use it.
import { Router } from 'express';
import { wrap, idParam } from '../http.js';
import { httpError } from '../lib/errors.js';
import { isOwner } from '../lib/paid.js';
import { creditStatus } from '../data/credits.js';
import { getSettings, saveSettings, overview, listUsers, listTeam, addCredit, listPayouts, decidePayout } from '../data/team.js';

const router = Router();
router.use((req, _res, next) => (isOwner(req) ? next() : next(httpError(403, 'هذه اللوحة لصاحب الموقع فقط.'))));

router.get('/overview', wrap(async () => ({ ...(await overview()), credits: await creditStatus().catch(() => null) })));
router.get('/users', wrap(async () => ({ users: await listUsers() })));
router.get('/team', wrap(async () => ({ members: await listTeam() })));
router.post('/team/:id/credit', wrap(async (req) => ({ ok: true, ...(await addCredit(idParam(req), req.body?.amount, req.body?.note)), members: await listTeam() })));
router.get('/payouts', wrap(async () => ({ payouts: await listPayouts() })));
router.post('/payouts/:id', wrap(async (req) => ({ ok: true, payouts: await decidePayout(idParam(req), req.body?.action, req.body?.note) })));
router.get('/settings', wrap(async () => ({ settings: await getSettings() })));
router.put('/settings', wrap(async (req) => ({ ok: true, settings: await saveSettings(req.body || {}) })));

export default router;
