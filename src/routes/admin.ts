import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { notFound } from '../lib/errors';
import { requireAuth, requireRole } from '../middleware/auth';
import { query } from '../db/pool';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('admin', 'operator'));

adminRouter.get(
  '/devices',
  asyncHandler(async (_req, res) => {
    const result = await query(
      `
        SELECT cd.*, dcs.status, dcs.last_seen_at, dcs.updated_at AS connectivity_updated_at
        FROM ced_devices cd
        LEFT JOIN device_connectivity_status dcs ON dcs.ced_device_id = cd.id
        ORDER BY cd.ced_no
      `
    );
    res.json({ devices: result.rows });
  })
);

adminRouter.post(
  '/coaches',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        coach_no: z.string().min(1),
        coach_name: z.string().min(1),
        line_name: z.string().optional().nullable()
      })
      .parse(req.body);
    const result = await query(
      `
        INSERT INTO coaches (coach_no, coach_name, line_name)
        VALUES ($1, $2, $3)
        RETURNING *
      `,
      [body.coach_no, body.coach_name, body.line_name ?? null]
    );
    res.status(201).json({ coach: result.rows[0] });
  })
);

adminRouter.patch(
  '/coaches/:id',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        coach_name: z.string().min(1).optional(),
        line_name: z.string().optional().nullable(),
        is_active: z.boolean().optional()
      })
      .parse(req.body);
    const result = await query(
      `
        UPDATE coaches
        SET coach_name = COALESCE($2, coach_name),
            line_name = COALESCE($3, line_name),
            is_active = COALESCE($4, is_active),
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [req.params.id, body.coach_name ?? null, body.line_name ?? null, body.is_active ?? null]
    );
    if (!result.rows[0]) throw notFound('Coach not found');
    res.json({ coach: result.rows[0] });
  })
);

adminRouter.post(
  '/ced-devices',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        ced_no: z.string().min(1),
        serial_no: z.string().optional().nullable(),
        firmware_version: z.string().optional().nullable()
      })
      .parse(req.body);
    const result = await query(
      `
        INSERT INTO ced_devices (ced_no, serial_no, firmware_version)
        VALUES ($1, $2, $3)
        RETURNING *
      `,
      [body.ced_no, body.serial_no ?? null, body.firmware_version ?? null]
    );
    res.status(201).json({ device: result.rows[0] });
  })
);

adminRouter.patch(
  '/ced-devices/:id',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        serial_no: z.string().optional().nullable(),
        firmware_version: z.string().optional().nullable(),
        is_active: z.boolean().optional()
      })
      .parse(req.body);
    const result = await query(
      `
        UPDATE ced_devices
        SET serial_no = COALESCE($2, serial_no),
            firmware_version = COALESCE($3, firmware_version),
            is_active = COALESCE($4, is_active),
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [req.params.id, body.serial_no ?? null, body.firmware_version ?? null, body.is_active ?? null]
    );
    if (!result.rows[0]) throw notFound('Device not found');
    res.json({ device: result.rows[0] });
  })
);
