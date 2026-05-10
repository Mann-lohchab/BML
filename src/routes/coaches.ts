import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { notFound } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { query } from '../db/pool';
import { listActiveAlerts, listAlertHistory } from '../services/alert-service';

export const coachesRouter = Router();

function getRouteParam(value: string | string[] | undefined, name: string) {
  return z.string().min(1, `${name} is required`).parse(value);
}

coachesRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const result = await query(
      `
        SELECT c.id, c.coach_no, c.coach_name, c.line_name, c.is_active,
               tl.status AS latest_status, tl.sample_ts AS latest_sample_ts,
               tl.reference_speed, tl.online, tl.active, tl.off
        FROM coaches c
        LEFT JOIN telemetry_latest tl ON tl.coach_id = c.id
        ORDER BY c.coach_no
      `
    );
    res.json({ coaches: result.rows });
  })
);

coachesRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const resolvedCoach = await resolveCoach(getRouteParam(req.params.id, 'id'));
    const result = await query(
      `
        SELECT c.id, c.coach_no, c.coach_name, c.line_name, c.is_active,
               tl.status AS latest_status, tl.sample_ts AS latest_sample_ts,
               tl.reference_speed, tl.online, tl.active, tl.off,
               tl.gps_lon, tl.gps_lat, tl.gps_alt, tl.axle_speeds_json, tl.valve_states_json
        FROM coaches c
        LEFT JOIN telemetry_latest tl ON tl.coach_id = c.id
        WHERE c.id = $1
        LIMIT 1
      `,
      [resolvedCoach.id]
    );
    const coach = result.rows[0];
    if (!coach) throw notFound('Coach not found');
    res.json({ coach });
  })
);

coachesRouter.get(
  '/:id/latest',
  requireAuth,
  asyncHandler(async (req, res) => {
    const resolvedCoach = await resolveCoach(getRouteParam(req.params.id, 'id'));
    const result = await query(
      `
        SELECT tl.*
        FROM telemetry_latest tl
        WHERE tl.coach_id = $1
        LIMIT 1
      `,
      [resolvedCoach.id]
    );
    const latest = result.rows[0];
    if (!latest) throw notFound('Latest telemetry not found');
    res.json({ latest });
  })
);

coachesRouter.get(
  '/:id/trends',
  requireAuth,
  asyncHandler(async (req, res) => {
    const schema = z.object({ hours: z.coerce.number().int().positive().max(168).default(24) });
    const { hours } = schema.parse(req.query);
    const coach = await resolveCoach(getRouteParam(req.params.id, 'id'));
    const result = await query(
      `
        SELECT ts.sample_ts, ts.reference_speed, ts.speed_axle_1, ts.speed_axle_2,
               ts.speed_axle_3, ts.speed_axle_4, ts.ced_udp_error, ts.ced_gps_unlock
        FROM telemetry_samples ts
        WHERE ts.coach_id = $1
          AND ts.sample_ts >= now() - ($2 || ' hours')::interval
        ORDER BY ts.sample_ts ASC
      `,
      [coach.id, hours]
    );
    res.json({ samples: result.rows });
  })
);

coachesRouter.get(
  '/:id/valves',
  requireAuth,
  asyncHandler(async (req, res) => {
    const coach = await resolveCoach(getRouteParam(req.params.id, 'id'));
    const result = await query(
      `
        SELECT tl.valve_states_json, tl.axle_speeds_json, tl.status, tl.sample_ts
        FROM telemetry_latest tl
        WHERE tl.coach_id = $1
        LIMIT 1
      `,
      [coach.id]
    );
    const valves = result.rows[0];
    if (!valves) throw notFound('Valve state not found');
    res.json({ valves });
  })
);

coachesRouter.get(
  '/:id/alerts/active',
  requireAuth,
  asyncHandler(async (req, res) => {
    const coach = await resolveCoach(getRouteParam(req.params.id, 'id'));
    res.json({ alerts: await listActiveAlerts(coach.id) });
  })
);

coachesRouter.get(
  '/:id/alerts/history',
  requireAuth,
  asyncHandler(async (req, res) => {
    const coach = await resolveCoach(getRouteParam(req.params.id, 'id'));
    res.json({ alerts: await listAlertHistory(coach.id) });
  })
);

coachesRouter.get(
  '/:id/shelling',
  requireAuth,
  asyncHandler(async (req, res) => {
    const schema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
    const { date } = schema.parse(req.query);
    const indexDate = date ?? new Date().toISOString().slice(0, 10);
    const coach = await resolveCoach(getRouteParam(req.params.id, 'id'));
    const result = await query(
      `
        SELECT *
        FROM daily_shelling_index
        WHERE coach_id = $1
          AND index_date = $2
        ORDER BY scope, axle_no NULLS LAST
      `,
      [coach.id, indexDate]
    );
    res.json({ shelling: result.rows });
  })
);

coachesRouter.get(
  '/:id/location-history',
  requireAuth,
  asyncHandler(async (req, res) => {
    const schema = z.object({ hours: z.coerce.number().int().positive().max(168).default(24) });
    const { hours } = schema.parse(req.query);
    const coach = await resolveCoach(getRouteParam(req.params.id, 'id'));
    const result = await query(
      `
        SELECT ts.sample_ts, ts.gps_lon, ts.gps_lat, ts.gps_alt, ts.reference_speed
        FROM telemetry_samples ts
        WHERE ts.coach_id = $1
          AND ts.sample_ts >= now() - ($2 || ' hours')::interval
        ORDER BY ts.sample_ts ASC
      `,
      [coach.id, hours]
    );
    res.json({ points: result.rows });
  })
);

async function resolveCoach(identifier: string) {
  const result = await query<{ id: string }>(
    `
      SELECT id
      FROM coaches
      WHERE id = $1 OR coach_no = $1
      LIMIT 1
    `,
    [identifier]
  );
  const coach = result.rows[0];
  if (!coach) {
    throw notFound('Coach not found');
  }
  return coach;
}
