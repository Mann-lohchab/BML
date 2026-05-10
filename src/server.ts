import { createApp } from './app';
import { env } from './config/env';
import { pool } from './db/pool';

async function main() {
  const app = createApp();
  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`SAT API listening on http://localhost:${env.PORT}`);
  });

  process.on('SIGINT', async () => {
    await pool.end();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await pool.end();
    process.exit(0);
  });
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
