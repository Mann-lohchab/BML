import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { requireAuth } from '../middleware/auth';
import { query } from '../db/pool';

export const overviewRouter = Router();

overviewRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const coaches = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM coaches');
    const online = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM telemetry_latest WHERE online = true`
    );
    const alerts = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM alert_events WHERE status = 'open'`
    );
    const notifications = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM notifications WHERE delivery_status = 'queued'`
    );
    res.json({
      summary: {
        coaches: Number(coaches.rows[0].count),
        online: Number(online.rows[0].count),
        offline: Number(coaches.rows[0].count) - Number(online.rows[0].count),
        activeAlerts: Number(alerts.rows[0].count),
        queuedNotifications: Number(notifications.rows[0].count)
      }
    });
  })
);

overviewRouter.get(
  '/map',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const result = await query(
      `
        SELECT c.id, c.coach_no, c.coach_name, tl.status, tl.online, tl.active, tl.off,
               tl.gps_lon, tl.gps_lat, tl.gps_alt, tl.sample_ts, tl.reference_speed
        FROM coaches c
        LEFT JOIN telemetry_latest tl ON tl.coach_id = c.id
        ORDER BY c.coach_no
      `
    );
    res.json({ points: result.rows });
  })
);

overviewRouter.get(
  '/activity',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const telemetry = await query(
      `
        SELECT ts.id, c.coach_no, ts.sample_ts, ts.reference_speed, ts.created_at
        FROM telemetry_samples ts
        LEFT JOIN coaches c ON c.id = ts.coach_id
        ORDER BY ts.created_at DESC
        LIMIT 50
      `
    );
    const alerts = await query(
      `
        SELECT ae.id, c.coach_no, ae.alert_name, ae.status, ae.start_time, ae.end_time
        FROM alert_events ae
        LEFT JOIN coaches c ON c.id = ae.coach_id
        ORDER BY ae.created_at DESC
        LIMIT 50
      `
    );
    res.json({ telemetry: telemetry.rows, alerts: alerts.rows });
  })
);

overviewRouter.get(
  '/triggers',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const result = await query(
      `
        SELECT id, name, metric, operator, threshold, severity, is_active, condition_json, created_at
        FROM trigger_rules
        ORDER BY created_at DESC
      `
    );
    res.json({ triggers: result.rows });
  })
);
