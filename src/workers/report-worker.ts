import { pool, query } from '../db/pool';
import { generateReportArtifact } from '../services/report-service';

async function runOnce() {
  const queued = await query<{ report_request_id: string }>(
    `
      SELECT report_request_id
      FROM report_jobs
      WHERE status IN ('queued', 'retry')
      ORDER BY created_at ASC
      LIMIT 10
    `
  );

  for (const job of queued.rows) {
    await generateReportArtifact(job.report_request_id);
  }
}

async function main() {
  await runOnce();
  setInterval(() => {
    void runOnce().catch((error) => {
      // eslint-disable-next-line no-console
      console.error('report worker error', error);
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
