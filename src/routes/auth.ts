import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { badRequest } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { loadUserById, signToken, verifyPassword } from '../services/auth-service';
import { query } from '../db/pool';

export const authRouter = Router();

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8)
    });
    const body = schema.parse(req.body);
    const user = await verifyPassword(body.email, body.password);
    const token = signToken(user);
    res.json({ token, user });
  })
);

authRouter.post(
  '/logout',
  asyncHandler(async (_req, res) => {
    res.json({ ok: true });
  })
);

authRouter.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const body = z.object({ email: z.string().email() }).parse(req.body);
    const user = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      body.email.toLowerCase()
    ]);
    if (user.rows[0]) {
      await query(
        `
          INSERT INTO audit_logs (action, entity_type, entity_id, metadata_json)
          VALUES ('forgot_password', 'user', $1, $2)
        `,
        [user.rows[0].id, { email: body.email }]
      );
    }
    res.json({ ok: true });
  })
);

authRouter.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        token: z.string().min(1),
        password: z.string().min(8)
      })
      .parse(req.body);
    if (!body.token) {
      throw badRequest('Token is required');
    }
    res.json({ ok: true });
  })
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUserById(req.user!.id);
    res.json({ user });
  })
);
