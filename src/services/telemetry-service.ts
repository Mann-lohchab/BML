import type { PoolClient } from 'pg';
import { query, withTransaction } from '../db/pool';
import { badRequest } from '../lib/errors';
import { parseInboundPacket, decryptWspdPayload, parseWspdPayload } from '../lib/packet';
import { evaluateShelling } from '../lib/shelling';
import { sha256 } from '../lib/hash';

export type IngestResult = {
  rawPacketId: string;
  telemetrySampleId?: string;
  duplicated: boolean;
};

function sampleTimestampToDate(sampleTs: unknown, fallbackMs: number) {
  if (typeof sampleTs === 'string' && /^\d+$/.test(sampleTs.trim())) {
    return new Date(Number(sampleTs));
  }
  if (typeof sampleTs === 'string' && sampleTs.trim()) {
    const parsed = new Date(sampleTs);
    if (!Number.isNaN(parsed.valueOf())) return parsed;
  }
  if (typeof sampleTs === 'number' && Number.isFinite(sampleTs)) {
    return new Date(sampleTs);
  }
  return new Date(fallbackMs);
}

export async function ingestTelemetry(topic: string, rawPayload: string | Buffer): Promise<IngestResult> {
  const envelope = parseInboundPacket(topic, rawPayload);
  const payloadText = Buffer.isBuffer(rawPayload) ? rawPayload.toString('utf8') : rawPayload;
  const dedupKey = sha256([topic, payloadText].join('|'));

  return withTransaction(async (client) => {
    const coach = await ensureCoach(client, envelope.coach_no);
    const device = await ensureDevice(client, envelope.ced_no);
    await linkCoachAndDevice(client, coach.id, device.id);

    const insertedPacket = await client.query<{
      id: string;
    }>(
      `
        INSERT INTO raw_mqtt_packets (
          topic, coach_no, ced_no, packet_ts_ms, gps_lon, gps_lat, gps_alt,
          encrypted_wspd_data, error_code_hex, end_bit, payload_hash, raw_payload, parse_status
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending')
        ON CONFLICT (payload_hash) DO NOTHING
        RETURNING id
      `,
      [
        envelope.topic,
        envelope.coach_no,
        envelope.ced_no,
        envelope.timestamp,
        envelope.longitude,
        envelope.latitude,
        envelope.altitude,
        envelope.encrypted_wspd_data,
        envelope.error_code,
        envelope.end_bit,
        dedupKey,
        envelope.raw_payload
      ]
    );

    if (!insertedPacket.rows[0]) {
      const existing = await client.query<{ id: string }>(
        'SELECT id FROM raw_mqtt_packets WHERE payload_hash = $1',
        [dedupKey]
      );
      return {
        rawPacketId: existing.rows[0].id,
        duplicated: true
      };
    }

    const rawPacketId = insertedPacket.rows[0].id;

    try {
      const decrypted = decryptWspdPayload(envelope.encrypted_wspd_data);
      const decoded = parseWspdPayload(decrypted);
      const sampleTs = sampleTimestampToDate(decoded.sample_ts, envelope.timestamp);
      const shelling = evaluateShelling(decoded);
      const latestStatus = deriveStatus(sampleTs, decoded);

      const sample = await client.query<{ id: string }>(
        `
          INSERT INTO telemetry_samples (
            packet_id, coach_id, ced_device_id, sample_ts, gps_lon, gps_lat, gps_alt,
            speed_axle_1, speed_axle_2, speed_axle_3, speed_axle_4, reference_speed,
            hold_1, vent_1, hold_2, vent_2, hold_3, vent_3, hold_4, vent_4,
            fault_bits_json, status_bits_json, ced_udp_error, ced_gps_unlock, ced_memory_overflow,
            ced_network_error, raw_decrypted_payload
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
            $13,$14,$15,$16,$17,$18,$19,$20,
            $21,$22,$23,$24,$25,$26,$27
          )
          RETURNING id
        `,
        [
          rawPacketId,
          coach.id,
          device.id,
          sampleTs,
          envelope.longitude,
          envelope.latitude,
          envelope.altitude,
          decoded.speed_axle_1 ?? null,
          decoded.speed_axle_2 ?? null,
          decoded.speed_axle_3 ?? null,
          decoded.speed_axle_4 ?? null,
          decoded.reference_speed ?? null,
          decoded.hold_1 ?? null,
          decoded.vent_1 ?? null,
          decoded.hold_2 ?? null,
          decoded.vent_2 ?? null,
          decoded.hold_3 ?? null,
          decoded.vent_3 ?? null,
          decoded.hold_4 ?? null,
          decoded.vent_4 ?? null,
          decoded.fault_bits ?? {},
          decoded.status_bits ?? {},
          decoded.ced_udp_error ?? false,
          decoded.ced_gps_unlock ?? false,
          decoded.ced_memory_overflow ?? false,
          decoded.ced_network_error ?? false,
          decoded
        ]
      );

      await client.query(
        `
          UPDATE raw_mqtt_packets
          SET parse_status = 'ok', parse_error = NULL
          WHERE id = $1
        `,
        [rawPacketId]
      );

      await upsertLatest(client, {
        coachId: coach.id,
        cedDeviceId: device.id,
        sampleId: sample.rows[0].id,
        sampleTs,
        referenceSpeed: Number(decoded.reference_speed ?? 0),
        axleSpeeds: [
          Number(decoded.speed_axle_1 ?? 0),
          Number(decoded.speed_axle_2 ?? 0),
          Number(decoded.speed_axle_3 ?? 0),
          Number(decoded.speed_axle_4 ?? 0)
        ],
        valveStates: {
          hold_1: decoded.hold_1 ?? null,
          vent_1: decoded.vent_1 ?? null,
          hold_2: decoded.hold_2 ?? null,
          vent_2: decoded.vent_2 ?? null,
          hold_3: decoded.hold_3 ?? null,
          vent_3: decoded.vent_3 ?? null,
          hold_4: decoded.hold_4 ?? null,
          vent_4: decoded.vent_4 ?? null
        },
        status: latestStatus.status,
        online: latestStatus.online,
        active: latestStatus.active,
        off: latestStatus.off,
        gpsLon: envelope.longitude ?? null,
        gpsLat: envelope.latitude ?? null,
        gpsAlt: envelope.altitude ?? null
      });

      for (const evaluation of shelling) {
        await client.query(
          `
            INSERT INTO shelling_flags (
              coach_id, ced_device_id, sample_ts, axle_no, is_shelling, reason_json,
              reference_speed, axle_speed
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          `,
          [
            coach.id,
            device.id,
            sampleTs,
            evaluation.axleNo,
            evaluation.isShelling,
            evaluation.reason,
            Number(decoded.reference_speed ?? 0),
          Number((decoded[`speed_axle_${evaluation.axleNo}`] as number | string | undefined) ?? 0)
        ]
      );
      }

      return {
        rawPacketId,
        telemetrySampleId: sample.rows[0].id,
        duplicated: false
      };
    } catch (error) {
      await client.query(
        `
          UPDATE raw_mqtt_packets
          SET parse_status = 'error', parse_error = $2
          WHERE id = $1
        `,
        [rawPacketId, error instanceof Error ? error.message : String(error)]
      );
      throw error;
    }
  });
}

async function ensureCoach(client: PoolClient, coachNo: string) {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO coaches (coach_no, coach_name)
      VALUES ($1, $2)
      ON CONFLICT (coach_no) DO UPDATE SET updated_at = now()
      RETURNING id
    `,
    [coachNo, `Coach ${coachNo}`]
  );
  return result.rows[0];
}

async function ensureDevice(client: PoolClient, cedNo: string) {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO ced_devices (ced_no)
      VALUES ($1)
      ON CONFLICT (ced_no) DO UPDATE SET updated_at = now()
      RETURNING id
    `,
    [cedNo]
  );
  return result.rows[0];
}

async function linkCoachAndDevice(client: PoolClient, coachId: string, deviceId: string) {
  const existing = await client.query(
    `
      SELECT id
      FROM device_assignments
      WHERE coach_id = $1 AND ced_device_id = $2 AND is_active = true
      LIMIT 1
    `,
    [coachId, deviceId]
  );

  if (existing.rowCount) {
    return;
  }

  await client.query(
    `
      UPDATE device_assignments
      SET is_active = false, assigned_to = now()
      WHERE (coach_id = $1 OR ced_device_id = $2) AND is_active = true
    `,
    [coachId, deviceId]
  );

  await client.query(
    `
      INSERT INTO device_assignments (coach_id, ced_device_id, is_active)
      VALUES ($1, $2, true)
    `,
    [coachId, deviceId]
  );
}

type LatestInput = {
  coachId: string;
  cedDeviceId: string;
  sampleId: string;
  sampleTs: Date;
  referenceSpeed: number;
  axleSpeeds: number[];
  valveStates: Record<string, unknown>;
  status: string;
  online: boolean;
  active: boolean;
  off: boolean;
  gpsLon: number | null;
  gpsLat: number | null;
  gpsAlt: number | null;
};

async function upsertLatest(client: PoolClient, input: LatestInput) {
  await client.query(
    `
      INSERT INTO telemetry_latest (
        coach_id, ced_device_id, sample_id, sample_ts, reference_speed,
        axle_speeds_json, valve_states_json, status, online, active, off,
        gps_lon, gps_lat, gps_alt, updated_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now()
      )
      ON CONFLICT (coach_id) DO UPDATE SET
        ced_device_id = EXCLUDED.ced_device_id,
        sample_id = EXCLUDED.sample_id,
        sample_ts = EXCLUDED.sample_ts,
        reference_speed = EXCLUDED.reference_speed,
        axle_speeds_json = EXCLUDED.axle_speeds_json,
        valve_states_json = EXCLUDED.valve_states_json,
        status = EXCLUDED.status,
        online = EXCLUDED.online,
        active = EXCLUDED.active,
        off = EXCLUDED.off,
        gps_lon = EXCLUDED.gps_lon,
        gps_lat = EXCLUDED.gps_lat,
        gps_alt = EXCLUDED.gps_alt,
        updated_at = now()
    `,
    [
      input.coachId,
      input.cedDeviceId,
      input.sampleId,
      input.sampleTs,
      input.referenceSpeed,
      input.axleSpeeds,
      input.valveStates,
      input.status,
      input.online,
      input.active,
      input.off,
      input.gpsLon,
      input.gpsLat,
      input.gpsAlt
    ]
  );

  await client.query(
    `
      INSERT INTO device_connectivity_status (
        ced_device_id, coach_id, status, last_seen_at, last_packet_id, last_error_json, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,'{}'::jsonb,now())
      ON CONFLICT (ced_device_id) DO UPDATE SET
        coach_id = EXCLUDED.coach_id,
        status = EXCLUDED.status,
        last_seen_at = EXCLUDED.last_seen_at,
        last_packet_id = EXCLUDED.last_packet_id,
        updated_at = now()
    `,
    [input.cedDeviceId, input.coachId, input.status, input.sampleTs, input.sampleId]
  );
}

function deriveStatus(sampleTs: Date, decoded: Record<string, unknown>) {
  const online = Date.now() - sampleTs.getTime() <= 15 * 60 * 1000;
  const referenceSpeed = Number(decoded.reference_speed ?? 0);
  const udpError = Boolean(decoded.ced_udp_error);
  const status = !online || udpError ? 'Off' : referenceSpeed > 0 ? 'Active' : 'Idle';
  return {
    online,
    active: online && referenceSpeed > 0 && !udpError,
    off: !online || udpError,
    status
  };
}

export async function computeDailyShellingIndex(coachId: string, indexDate: string) {
  const dayStart = new Date(`${indexDate}T00:00:00.000Z`);
  const dayEnd = new Date(`${indexDate}T23:59:59.999Z`);
  const sampleResult = await query<{
    sample_ts: Date;
    reference_speed: string | number;
    speed_axle_1: string | number | null;
    speed_axle_2: string | number | null;
    speed_axle_3: string | number | null;
    speed_axle_4: string | number | null;
  }>(
    `
      SELECT sample_ts, reference_speed, speed_axle_1, speed_axle_2, speed_axle_3, speed_axle_4
      FROM telemetry_samples
      WHERE coach_id = $1
        AND sample_ts >= $2
        AND sample_ts <= $3
      ORDER BY sample_ts ASC
    `,
    [coachId, dayStart, dayEnd]
  );

  const shellingResult = await query<{
    sample_ts: Date;
    axle_no: number;
    is_shelling: boolean;
  }>(
    `
      SELECT sample_ts, axle_no, is_shelling
      FROM shelling_flags
      WHERE coach_id = $1
        AND sample_ts >= $2
        AND sample_ts <= $3
      ORDER BY sample_ts ASC, axle_no ASC
    `,
    [coachId, dayStart, dayEnd]
  );

  const durationsByAxle = new Map<number, { running: number; shelling: number }>();
  const shellingBySample = new Map<string, boolean[]>();
  let coachRunning = 0;
  let coachShelling = 0;

  for (const row of shellingResult.rows) {
    const key = new Date(row.sample_ts).toISOString();
    const current = shellingBySample.get(key) ?? [false, false, false, false];
    current[row.axle_no - 1] = row.is_shelling;
    shellingBySample.set(key, current);
  }

  for (let i = 0; i < sampleResult.rows.length; i += 1) {
    const current = sampleResult.rows[i];
    const next = sampleResult.rows[i + 1];
    const currentTs = new Date(current.sample_ts).getTime();
    const nextTs = next ? new Date(next.sample_ts).getTime() : dayEnd.getTime();
    const durationMs = Math.max(0, nextTs - currentTs);
    const running = Number(current.reference_speed) > 5;
    const shellingStates = shellingBySample.get(new Date(current.sample_ts).toISOString()) ?? [
      false,
      false,
      false,
      false
    ];

    for (let axleNo = 1; axleNo <= 4; axleNo += 1) {
      const bucket = durationsByAxle.get(axleNo) ?? { running: 0, shelling: 0 };
      if (running) {
        bucket.running += durationMs;
      }
      if (shellingStates[axleNo - 1]) {
        bucket.shelling += durationMs;
      }
      durationsByAxle.set(axleNo, bucket);
    }

    if (running) {
      coachRunning += durationMs;
      if (shellingStates.some(Boolean)) {
        coachShelling += durationMs;
      }
    }
  }

  const axleResults = [1, 2, 3, 4].map((axleNo) => {
    const bucket = durationsByAxle.get(axleNo) ?? { running: 0, shelling: 0 };
    const indexPct = bucket.running > 0 ? (bucket.shelling / bucket.running) * 100 : null;
    return {
      scope: 'axle' as const,
      axleNo,
      axleRunningDurationMs: bucket.running,
      axleShellingDurationMs: bucket.shelling,
      axleShellingIndexPct: indexPct,
      coachRunningDurationMs: bucket.running,
      coachShellingDurationMs: bucket.shelling,
      coachShellingIndexPct: indexPct
    };
  });

  const coachResult = {
    scope: 'coach' as const,
    axleNo: 0,
    axleRunningDurationMs: coachRunning,
    axleShellingDurationMs: coachShelling,
    axleShellingIndexPct: coachRunning > 0 ? (coachShelling / coachRunning) * 100 : null,
    coachRunningDurationMs: coachRunning,
    coachShellingDurationMs: coachShelling,
    coachShellingIndexPct: coachRunning > 0 ? (coachShelling / coachRunning) * 100 : null
  };

  const results = [...axleResults, coachResult];

  await withTransaction(async (client) => {
    for (const item of results) {
      await client.query(
        `
          INSERT INTO daily_shelling_index (
            coach_id, index_date, axle_no, scope,
            axle_running_duration_ms, axle_shelling_duration_ms, axle_shelling_index_pct,
            coach_running_duration_ms, coach_shelling_duration_ms, coach_shelling_index_pct
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          ON CONFLICT (coach_id, index_date, scope, axle_no) DO UPDATE SET
            axle_running_duration_ms = EXCLUDED.axle_running_duration_ms,
            axle_shelling_duration_ms = EXCLUDED.axle_shelling_duration_ms,
            axle_shelling_index_pct = EXCLUDED.axle_shelling_index_pct,
            coach_running_duration_ms = EXCLUDED.coach_running_duration_ms,
            coach_shelling_duration_ms = EXCLUDED.coach_shelling_duration_ms,
            coach_shelling_index_pct = EXCLUDED.coach_shelling_index_pct,
            computed_at = now()
        `,
        [
          coachId,
          indexDate,
          item.axleNo,
          item.scope,
          item.axleRunningDurationMs,
          item.axleShellingDurationMs,
          item.axleShellingIndexPct,
          coachRunning,
          coachShelling,
          coachRunning > 0 ? (coachShelling / coachRunning) * 100 : null
        ]
      );
    }
  });

  return results;
}

export async function updateConnectivityAndStatusFromLatest(coachId: string) {
  const latest = await query<{
    ced_device_id: string;
    sample_id: string;
    sample_ts: Date;
    reference_speed: string | number;
    status: string;
    gps_lon: string | number | null;
    gps_lat: string | number | null;
    gps_alt: string | number | null;
    ced_udp_error: boolean;
  }>(
    `
      SELECT tl.ced_device_id, tl.sample_id, tl.sample_ts, tl.reference_speed, tl.status,
             tl.gps_lon, tl.gps_lat, tl.gps_alt, COALESCE(ts.ced_udp_error, false) AS ced_udp_error
      FROM telemetry_latest tl
      LEFT JOIN telemetry_samples ts ON ts.id = tl.sample_id
      WHERE tl.coach_id = $1
    `,
    [coachId]
  );

  if (!latest.rows[0]) {
    throw badRequest('No latest telemetry found for coach');
  }

  const row = latest.rows[0];
  const sampleTs = new Date(row.sample_ts);
  const online = Date.now() - sampleTs.getTime() <= 15 * 60 * 1000;
  const referenceSpeed = Number(row.reference_speed ?? 0);
  const off = !online || row.ced_udp_error;
  const status = off ? 'Off' : referenceSpeed > 0 ? 'Active' : 'Idle';

  await query(
    `
      UPDATE telemetry_latest
      SET online = $2,
          active = $3,
          off = $4,
          status = $5,
          updated_at = now()
      WHERE coach_id = $1
    `,
    [coachId, online, online && referenceSpeed > 0 && !row.ced_udp_error, off, status]
  );

  await query(
    `
      INSERT INTO device_connectivity_status (
        ced_device_id, coach_id, status, last_seen_at, last_packet_id, last_error_json, updated_at
      )
      VALUES ($2, $1, $3, $4, $5, '{}'::jsonb, now())
      ON CONFLICT (ced_device_id) DO UPDATE SET
        coach_id = EXCLUDED.coach_id,
        status = EXCLUDED.status,
        last_seen_at = EXCLUDED.last_seen_at,
        last_packet_id = EXCLUDED.last_packet_id,
        updated_at = now()
    `,
    [coachId, row.ced_device_id, status, sampleTs, row.sample_id]
  );

  return {
    ...row,
    online,
    active: online && referenceSpeed > 0 && !row.ced_udp_error,
    off,
    status
  };
}
