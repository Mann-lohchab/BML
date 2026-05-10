import type { DecodedWspdPayload } from './packet';

export type ShellingEvaluation = {
  axleNo: number;
  isShelling: boolean;
  reason: {
    deltaKmH: number;
    referenceSpeed: number;
    axleSpeed: number;
    conditions: Record<string, boolean | number | undefined>;
  };
};

export function evaluateShelling(payload: DecodedWspdPayload): ShellingEvaluation[] {
  const referenceSpeed = Number(payload.reference_speed ?? 0);
  const statusBits = normalizeBits(payload.status_bits);

  const conditions = {
    E_SS_SC_OC: statusBits.E_SS_SC_OC ?? 0,
    E_SENS_FR: statusBits.E_SENS_FR ?? 0,
    WSPCU_Status: statusBits.WSPCU_Status ?? 1,
    Transient_Error: statusBits.Transient_Error ?? 0
  };

  const commonEnabled =
    Number(conditions.E_SS_SC_OC) === 0 &&
    Number(conditions.E_SENS_FR) === 0 &&
    Number(conditions.WSPCU_Status) === 1 &&
    Number(conditions.Transient_Error) === 0;

  return [1, 2, 3, 4].map((axleNo) => {
    const axleSpeed = Number(payload[`speed_axle_${axleNo}`] ?? 0);
    const deltaKmH = referenceSpeed - axleSpeed;
    const isShelling = commonEnabled && deltaKmH > 5;
    return {
      axleNo,
      isShelling,
      reason: {
        deltaKmH,
        referenceSpeed,
        axleSpeed,
        conditions
      }
    };
  });
}

export function normalizeBits(bits: unknown): Record<string, number> {
  if (!bits || typeof bits !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(bits as Record<string, unknown>).map(([key, value]) => [
      key,
      Number(typeof value === 'boolean' ? (value ? 1 : 0) : value ?? 0)
    ])
  );
}
