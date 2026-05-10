import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { notFound } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { query } from '../db/pool';

export const triggersRouter = Router();

triggersRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const result = await query(
      `
        SELECT id, name, metric, operator, threshold, duration_ms, severity, is_active,
               condition_json, created_at, updated_at
        FROM trigger_rules
        ORDER BY created_at DESC
      `
    );
    res.json({ triggers: result.rows });
  })
);

triggersRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1),
        metric: z.string().min(1),
        operator: z.string().min(1),
        threshold: z.coerce.number().optional().nullable(),
        duration_ms: z.coerce.number().int().positive().optional().nullable(),
        severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
        condition_json: z.record(z.unknown()).default({})
      })
      .parse(req.body);
    const result = await query(
      `
        INSERT INTO trigger_rules (
          name, metric, operator, threshold, duration_ms, severity, condition_json, created_by
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING *
      `,
      [
        body.name,
        body.metric,
        body.operator,
        body.threshold ?? null,
        body.duration_ms ?? null,
        body.severity,
        body.condition_json,
        req.user!.id
      ]
    );
    res.status(201).json({ trigger: result.rows[0] });
  })
);

triggersRouter.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1).optional(),
        metric: z.string().min(1).optional(),
        operator: z.string().min(1).optional(),
        threshold: z.coerce.number().optional().nullable(),
        duration_ms: z.coerce.number().int().positive().optional().nullable(),
        severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        is_active: z.boolean().optional(),
        condition_json: z.record(z.unknown()).optional()
      })
      .parse(req.body);
    const result = await query(
      `
        UPDATE trigger_rules
        SET name = COALESCE($2, name),
            metric = COALESCE($3, metric),
            operator = COALESCE($4, operator),
            threshold = COALESCE($5, threshold),
            duration_ms = COALESCE($6, duration_ms),
            severity = COALESCE($7, severity),
            is_active = COALESCE($8, is_active),
            condition_json = COALESCE($9, condition_json),
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [
        req.params.id,
        body.name ?? null,
        body.metric ?? null,
        body.operator ?? null,
        body.threshold ?? null,
        body.duration_ms ?? null,
        body.severity ?? null,
        body.is_active ?? null,
        body.condition_json ?? null
      ]
    );
    if (!result.rows[0]) throw notFound('Trigger not found');
    res.json({ trigger: result.rows[0] });
  })
);

triggersRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await query('DELETE FROM trigger_rules WHERE id = $1 RETURNING id', [
      req.params.id
    ]);
    if (!result.rows[0]) throw notFound('Trigger not found');
    res.json({ ok: true });
  })
);
