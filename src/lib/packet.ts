import crypto from 'node:crypto';
import { env } from '../config/env';
import { badRequest } from './errors';

export type InboundPacketEnvelope = {
  topic: string;
  coach_no: string;
  ced_no: string;
  timestamp: number;
  longitude?: number | null;
  latitude?: number | null;
  altitude?: number | null;
  encrypted_wspd_data: string;
  error_code: string;
  end_bit: string;
  raw_payload: Record<string, unknown>;
};

export type DecodedWspdPayload = {
  sample_ts?: string | number;
  speed_axle_1?: number;
  speed_axle_2?: number;
  speed_axle_3?: number;
  speed_axle_4?: number;
  reference_speed?: number;
  hold_1?: boolean;
  vent_1?: boolean;
  hold_2?: boolean;
  vent_2?: boolean;
  hold_3?: boolean;
  vent_3?: boolean;
  hold_4?: boolean;
  vent_4?: boolean;
  fault_bits?: Record<string, boolean | number>;
  status_bits?: Record<string, boolean | number>;
  ced_udp_error?: boolean;
  ced_gps_unlock?: boolean;
  ced_memory_overflow?: boolean;
  ced_network_error?: boolean;
  [key: string]: unknown;
};

export function parseInboundPacket(
  topic: string,
  payload: string | Buffer
): InboundPacketEnvelope {
  const text = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;

  if (text.trim().startsWith('{')) {
    const parsed = JSON.parse(text) as Partial<InboundPacketEnvelope>;
    const envelope = {
      topic,
      coach_no: String(parsed.coach_no),
      ced_no: String(parsed.ced_no),
      timestamp: Number(parsed.timestamp),
      longitude: parsed.longitude === undefined ? null : Number(parsed.longitude),
      latitude: parsed.latitude === undefined ? null : Number(parsed.latitude),
      altitude: parsed.altitude === undefined ? null : Number(parsed.altitude),
      encrypted_wspd_data: String(parsed.encrypted_wspd_data ?? ''),
      error_code: String(parsed.error_code ?? ''),
      end_bit: String(parsed.end_bit ?? ''),
      raw_payload: parsed as Record<string, unknown>
    };
    validateEnvelope(envelope, topic);
    return envelope;
  }

  const parts = text.split(',').map((part) => part.trim());
  if (parts.length >= 9) {
    const [coach_no, ced_no, timestamp, longitude, latitude, altitude, encrypted_wspd_data, error_code, end_bit] =
      parts;
    const envelope = {
      topic,
      coach_no,
      ced_no,
      timestamp: Number(timestamp),
      longitude: Number(longitude),
      latitude: Number(latitude),
      altitude: Number(altitude),
      encrypted_wspd_data,
      error_code,
      end_bit,
      raw_payload: {
        coach_no,
        ced_no,
        timestamp,
        longitude,
        latitude,
        altitude,
        encrypted_wspd_data,
        error_code,
        end_bit
      }
    };
    validateEnvelope(envelope, topic);
    return envelope;
  }

  throw badRequest('Unsupported packet envelope');
}

function validateEnvelope(partial: Partial<InboundPacketEnvelope>, topic: string) {
  if (!partial.coach_no || !partial.ced_no || partial.timestamp === undefined) {
    throw badRequest(`Missing required fields in packet from topic ${topic}`);
  }
  const endBit = String(partial.end_bit ?? '').toLowerCase();
  if (endBit !== '0x23' && endBit !== '35') {
    throw badRequest(`Invalid end bit for packet from topic ${topic}`);
  }
}

export function decryptWspdPayload(encrypted: string) {
  if (!encrypted) {
    return '';
  }

  if (env.SAT_WSPD_DECRYPTION === 'none') {
    return encrypted;
  }

  if (env.SAT_WSPD_DECRYPTION === 'base64') {
    return Buffer.from(encrypted, 'base64').toString('utf8');
  }

  if (env.SAT_WSPD_DECRYPTION === 'aes-256-gcm') {
    if (!env.SAT_WSPD_SECRET) {
      throw badRequest('SAT_WSPD_SECRET is required for AES decryption');
    }

    const [ivB64, cipherB64, tagB64] = encrypted.split(':');
    if (!ivB64 || !cipherB64 || !tagB64) {
      throw badRequest('Invalid AES-GCM payload format');
    }

    const key = crypto.createHash('sha256').update(env.SAT_WSPD_SECRET).digest();
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(ivB64, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(cipherB64, 'base64')),
      decipher.final()
    ]).toString('utf8');
  }

  return encrypted;
}

export function parseWspdPayload(payload: string): DecodedWspdPayload {
  const trimmed = payload.trim();
  if (!trimmed) {
    return {};
  }

  if (trimmed.startsWith('{')) {
    return normalizeDecodedPayload(JSON.parse(trimmed) as Record<string, unknown>);
  }

  const keyValuePairs = trimmed.includes('=') ? trimmed.split(/[;|,]/) : [];
  if (keyValuePairs.length > 0) {
    const result: Record<string, unknown> = {};
    const statusBits: Record<string, unknown> = {};
    const faultBits: Record<string, unknown> = {};
    for (const pair of keyValuePairs) {
      const [key, value] = pair.split('=').map((part) => part.trim());
      if (!key) continue;
      const coerced = coerceValue(value);
      if (isStatusBitKey(key)) {
        statusBits[key] = coerced;
      } else if (isFaultBitKey(key)) {
        faultBits[key] = coerced;
      } else {
        result[key] = coerced;
      }
    }
    if (Object.keys(statusBits).length > 0) {
      result.status_bits = statusBits;
    }
    if (Object.keys(faultBits).length > 0) {
      result.fault_bits = faultBits;
    }
    return normalizeDecodedPayload(result);
  }

  const values = trimmed.split(/[|]/).map((part) => part.trim());
  if (values.length >= 16) {
    return {
      sample_ts: values[0],
      speed_axle_1: Number(values[1]),
      speed_axle_2: Number(values[2]),
      speed_axle_3: Number(values[3]),
      speed_axle_4: Number(values[4]),
      reference_speed: Number(values[5]),
      hold_1: asBool(values[6]),
      vent_1: asBool(values[7]),
      hold_2: asBool(values[8]),
      vent_2: asBool(values[9]),
      hold_3: asBool(values[10]),
      vent_3: asBool(values[11]),
      hold_4: asBool(values[12]),
      vent_4: asBool(values[13]),
      fault_bits: {},
      status_bits: {},
      ced_udp_error: asBool(values[14]),
      ced_gps_unlock: asBool(values[15])
    };
  }

  throw badRequest('Unsupported WSPD payload format');
}

function coerceValue(value: string | undefined) {
  if (value === undefined) return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && value.trim() !== '' ? numeric : value;
}

function asBool(value: string | undefined) {
  return value === '1' || value === 'true' || value === 'TRUE';
}

function normalizeDecodedPayload(input: Record<string, unknown>): DecodedWspdPayload {
  const result: Record<string, unknown> = { ...input };
  const statusBits: Record<string, unknown> = {
    ...(isPlainObject(result.status_bits) ? (result.status_bits as Record<string, unknown>) : {})
  };
  const faultBits: Record<string, unknown> = {
    ...(isPlainObject(result.fault_bits) ? (result.fault_bits as Record<string, unknown>) : {})
  };

  for (const [key, value] of Object.entries(input)) {
    if (isStatusBitKey(key)) {
      statusBits[key] = value;
      delete result[key];
    } else if (isFaultBitKey(key)) {
      faultBits[key] = value;
      delete result[key];
    }
  }

  if (Object.keys(statusBits).length > 0) {
    result.status_bits = statusBits;
  }
  if (Object.keys(faultBits).length > 0) {
    result.fault_bits = faultBits;
  }

  return result as DecodedWspdPayload;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStatusBitKey(key: string) {
  return ['E_SS_SC_OC', 'E_SENS_FR', 'WSPCU_Status', 'Transient_Error'].includes(key);
}

function isFaultBitKey(key: string) {
  const normalized = key.toLowerCase();
  return (
    normalized !== 'fault_bits' &&
    normalized.startsWith('fault') &&
    !normalized.includes('_bits')
  );
}
