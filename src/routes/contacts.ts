import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { notFound } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { query } from '../db/pool';

export const contactsRouter = Router();

contactsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const result = await query('SELECT * FROM contacts ORDER BY created_at DESC');
    res.json({ contacts: result.rows });
  })
);

contactsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1),
        email: z.string().email().optional().nullable(),
        phone: z.string().optional().nullable(),
        preferred_channel: z.enum(['email', 'sms']).default('email')
      })
      .parse(req.body);
    const result = await query(
      `
        INSERT INTO contacts (name, email, phone, preferred_channel)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [body.name, body.email ?? null, body.phone ?? null, body.preferred_channel]
    );
    res.status(201).json({ contact: result.rows[0] });
  })
);

contactsRouter.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1).optional(),
        email: z.string().email().optional().nullable(),
        phone: z.string().optional().nullable(),
        preferred_channel: z.enum(['email', 'sms']).optional(),
        is_active: z.boolean().optional()
      })
      .parse(req.body);
    const result = await query(
      `
        UPDATE contacts
        SET name = COALESCE($2, name),
            email = COALESCE($3, email),
            phone = COALESCE($4, phone),
            preferred_channel = COALESCE($5, preferred_channel),
            is_active = COALESCE($6, is_active),
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [req.params.id, body.name ?? null, body.email ?? null, body.phone ?? null, body.preferred_channel ?? null, body.is_active ?? null]
    );
    if (!result.rows[0]) throw notFound('Contact not found');
    res.json({ contact: result.rows[0] });
  })
);

contactsRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await query('DELETE FROM contacts WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) throw notFound('Contact not found');
    res.json({ ok: true });
  })
);
