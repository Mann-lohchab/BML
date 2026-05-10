import type { PoolClient } from 'pg';
import { query, withTransaction } from '../db/pool';

export type TriggerRule = {
  id: string;
  name: string;
  metric: string;
  operator: string;
  threshold: string | number | null;
  severity: string;
  condition_json: Record<string, unknown>;
  is_active: boolean;
};

export async function evaluateTriggerRulesForCoach(coachId: string) {
  const latest = await query<{
    sample_ts: Date;
    reference_speed: string | number | null;
    status: string;
  }>(
    'SELECT sample_ts, reference_speed, status FROM telemetry_latest WHERE coach_id = $1',
    [coachId]
  );
  const current = latest.rows[0];
  if (!current) {
    return [];
  }

  const activeRules = await query<TriggerRule>(
    `
      SELECT id, name, metric, operator, threshold, severity, condition_json, is_active
      FROM trigger_rules
      WHERE is_active = true
      ORDER BY created_at DESC
    `
  );

  const createdOrClosed: Array<{ ruleId: string; status: 'opened' | 'closed' | 'noop' }> = [];

  await withTransaction(async (client) => {
    for (const rule of activeRules.rows) {
      const matched = await matchesRule(client, coachId, current, rule);
      const activeEvent = await client.query<{ id: string }>(
        `
          SELECT id
          FROM alert_events
          WHERE coach_id = $1
            AND alert_key = $2
            AND status = 'open'
          ORDER BY start_time DESC
          LIMIT 1
        `,
        [coachId, rule.id]
      );

      if (matched && !activeEvent.rows[0]) {
        const alertInsert = await client.query<{ id: string }>(
          `
            INSERT INTO alert_events (
              alert_key, alert_name, severity, coach_id, start_time, status, metadata_json, source_sample_ts
            ) 
            VALUES ($1,$2,$3,$4,now(),'open',$5,$6)
            RETURNING id
          `,
          [
            rule.id,
            rule.name,
            rule.severity,
            coachId,
            rule.condition_json,
            current.sample_ts
          ]
        );
        await enqueueNotification(client, coachId, rule, 'opened', alertInsert.rows[0].id);
        createdOrClosed.push({ ruleId: rule.id, status: 'opened' });
      } else if (!matched && activeEvent.rows[0]) {
        await client.query(
          `
            UPDATE alert_events
            SET status = 'closed',
                end_time = now(),
                duration_ms = ROUND(EXTRACT(EPOCH FROM (now() - start_time)) * 1000)::bigint,
            updated_at = now()
            WHERE id = $1
          `,
          [activeEvent.rows[0].id]
        );
        await enqueueNotification(client, coachId, rule, 'closed', activeEvent.rows[0].id);
        createdOrClosed.push({ ruleId: rule.id, status: 'closed' });
      } else {
        createdOrClosed.push({ ruleId: rule.id, status: 'noop' });
      }
    }
  });

  return createdOrClosed;
}

async function matchesRule(
  client: PoolClient,
  coachId: string,
  current: { reference_speed: string | number | null; status: string },
  rule: TriggerRule
) {
  if (rule.metric === 'shelling') {
    const shelling = await client.query<{ id: string }>(
      `
        SELECT id
        FROM shelling_flags sf
        JOIN telemetry_latest tl ON tl.coach_id = sf.coach_id
        WHERE sf.coach_id = $1
          AND sf.sample_ts = tl.sample_ts
          AND sf.is_shelling = true
        LIMIT 1
      `,
      [coachId]
    );
    return Boolean(shelling.rows[0]);
  }

  if (rule.metric === 'reference_speed') {
    const value = Number(current.reference_speed ?? 0);
    return compare(value, rule.operator, Number(rule.threshold ?? 0));
  }

  if (rule.metric === 'status') {
    return compareText(String(current.status), rule.operator, String(rule.threshold ?? ''));
  }

  return Boolean(rule.condition_json?.enabled ?? false);
}

function compare(left: number, operator: string, right: number) {
  switch (operator) {
    case '>':
      return left > right;
    case '>=':
      return left >= right;
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '=':
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    default:
      return false;
  }
}

function compareText(left: string, operator: string, right: string) {
  if (operator === '=' || operator === '==') {
    return left === right;
  }
  if (operator === '!=') {
    return left !== right;
  }
  return false;
}

async function enqueueNotification(
  client: PoolClient,
  coachId: string,
  rule: TriggerRule,
  state: 'opened' | 'closed',
  alertEventId: string
) {
  await client.query(
    `
      INSERT INTO notifications (
        alert_event_id, channel, subject, body, delivery_status
      )
      VALUES ($1, $2, $3, $4, 'queued')
    `,
    [
      alertEventId,
      'email',
      `${rule.name} ${state}`,
      `Alert ${rule.name} for coach ${coachId} ${state} at ${new Date().toISOString()}`
    ]
  );
}

export async function listActiveAlerts(coachId: string) {
  const result = await query(
    `
      SELECT id, alert_key, alert_name, severity, start_time, end_time, status,
             duration_ms, source_sample_ts, metadata_json, created_at
      FROM alert_events
      WHERE coach_id = $1 AND status = 'open'
      ORDER BY start_time DESC
    `,
    [coachId]
  );
  return result.rows;
}

export async function listAlertHistory(coachId: string) {
  const result = await query(
    `
      SELECT id, alert_key, alert_name, severity, start_time, end_time, status,
             duration_ms, source_sample_ts, metadata_json, created_at
      FROM alert_events
      WHERE coach_id = $1
      ORDER BY start_time DESC
      LIMIT 200
    `,
    [coachId]
  );
  return result.rows;
}

export async function listNotifications(userId?: string) {
  const result = await query<{
    id: string;
    user_id: string | null;
    contact_id: string | null;
    alert_event_id: string | null;
    channel: string;
    subject: string;
    body: string;
    delivery_status: string;
    provider_message_id: string | null;
    provider_response_json: Record<string, unknown> | null;
    read_at: Date | null;
    sent_at: Date | null;
    created_at: Date;
  }>(
    `
      SELECT id, user_id, contact_id, alert_event_id, channel, subject, body,
             delivery_status, provider_message_id, provider_response_json, read_at,
             sent_at, created_at
      FROM notifications
      WHERE ($1::uuid IS NULL OR user_id = $1 OR user_id IS NULL)
      ORDER BY created_at DESC
      LIMIT 200
    `,
    [userId ?? null]
  );
  return result.rows;
}

export async function markNotificationRead(notificationId: string) {
  const result = await query<{ id: string }>(
    `
      UPDATE notifications
      SET read_at = now()
      WHERE id = $1
      RETURNING id
    `,
    [notificationId]
  );
  return result.rows[0];
}
