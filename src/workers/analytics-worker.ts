import { query, pool } from '../db/pool';
import { computeDailyShellingIndex, updateConnectivityAndStatusFromLatest } from '../services/telemetry-service';
import { evaluateTriggerRulesForCoach } from '../services/alert-service';

async function runOnce() {
  const coaches = await query<{ id: string }>('SELECT id FROM coaches WHERE is_active = true');
  for (const coach of coaches.rows) {
    await updateConnectivityAndStatusFromLatest(coach.id).catch(() => undefined);
    await evaluateTriggerRulesForCoach(coach.id);
    await computeDailyShellingIndex(coach.id, new Date().toISOString().slice(0, 10));
  }
}

async function main() {
  await runOnce();
  setInterval(() => {
    void runOnce().catch((error) => {
      // eslint-disable-next-line no-console
      console.error('analytics worker error', error);
    });
  }, 60_000);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});

process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
