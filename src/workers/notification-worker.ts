import { query, pool } from '../db/pool';

async function runOnce() {
  const queued = await query<{
    id: string;
    channel: string;
    body: string;
  }>(
    `
      SELECT id, channel, body
      FROM notifications
      WHERE delivery_status = 'queued'
      ORDER BY created_at ASC
      LIMIT 100
    `
  );

  for (const notification of queued.rows) {
    await query(
      `
        UPDATE notifications
        SET delivery_status = 'sent',
            sent_at = now(),
            provider_message_id = $2,
            provider_response_json = $3
        WHERE id = $1
      `,
      [
        notification.id,
        `local-${notification.id}`,
        { channel: notification.channel, accepted: true }
      ]
    );
  }
}

async function main() {
  await runOnce();
  setInterval(() => {
    void runOnce().catch((error) => {
      // eslint-disable-next-line no-console
      console.error('notification worker error', error);
    });
  }, 30_000);
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
