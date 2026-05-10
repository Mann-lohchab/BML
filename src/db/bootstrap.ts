import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { pool } from './pool';

async function ensureRole(code: string, name: string) {
  await pool.query(
    `
      INSERT INTO roles (code, name)
      VALUES ($1, $2)
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
    `,
    [code, name]
  );
}

async function ensureBootstrapAdmin() {
  if (!env.SAT_BOOTSTRAP_ADMIN_EMAIL || !env.SAT_BOOTSTRAP_ADMIN_PASSWORD) {
    return;
  }

  await ensureRole('admin', 'Administrator');
  await ensureRole('operator', 'Operator');
  await ensureRole('viewer', 'Viewer');

  const passwordHash = await bcrypt.hash(env.SAT_BOOTSTRAP_ADMIN_PASSWORD, 12);
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [
    env.SAT_BOOTSTRAP_ADMIN_EMAIL
  ]);

  let userId = existing.rows[0]?.id as string | undefined;
  if (!userId) {
    const inserted = await pool.query<{ id: string }>(
      `
        INSERT INTO users (email, password_hash, full_name)
        VALUES ($1, $2, $3)
        RETURNING id
      `,
      [env.SAT_BOOTSTRAP_ADMIN_EMAIL, passwordHash, env.SAT_BOOTSTRAP_ADMIN_NAME]
    );
    userId = inserted.rows[0].id;
  } else {
    await pool.query(
      `
        UPDATE users
        SET password_hash = $2, full_name = $3, is_active = true, updated_at = now()
        WHERE id = $1
      `,
      [userId, passwordHash, env.SAT_BOOTSTRAP_ADMIN_NAME]
    );
  }

  const role = await pool.query<{ id: string }>(
    'SELECT id FROM roles WHERE code = $1',
    ['admin']
  );
  if (role.rows[0]) {
    await pool.query(
      `
        INSERT INTO user_roles (user_id, role_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `,
      [userId, role.rows[0].id]
    );
  }
}

async function main() {
  try {
    await ensureBootstrapAdmin();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
