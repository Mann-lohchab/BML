import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { query } from '../db/pool';
import { unauthorized } from '../lib/errors';

export type AuthenticatedUser = {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
};

export async function verifyPassword(email: string, password: string) {
  const result = await query<{
    id: string;
    email: string;
    full_name: string;
    password_hash: string;
    is_active: boolean;
  }>(
    `
      SELECT id, email, full_name, password_hash, is_active
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [email.toLowerCase()]
  );

  const user = result.rows[0];
  if (!user || !user.is_active) {
    throw unauthorized('Invalid credentials');
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    throw unauthorized('Invalid credentials');
  }

  const roles = await query<{ code: string }>(
    `
      SELECT r.code
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1
      ORDER BY r.code
    `,
    [user.id]
  );

  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    roles: roles.rows.map((row) => row.code)
  };
}

export function signToken(user: AuthenticatedUser) {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn']
  };

  return jwt.sign(
    { sub: user.id, email: user.email, roles: user.roles, fullName: user.fullName },
    env.JWT_SECRET,
    options
  );
}

export async function loadUserById(userId: string) {
  const result = await query<{
    id: string;
    email: string;
    full_name: string;
  }>('SELECT id, email, full_name FROM users WHERE id = $1 AND is_active = true', [userId]);

  const user = result.rows[0];
  if (!user) {
    throw unauthorized('Unauthorized');
  }

  const roles = await query<{ code: string }>(
    `
      SELECT r.code
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1
      ORDER BY r.code
    `,
    [user.id]
  );

  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    roles: roles.rows.map((row) => row.code)
  } satisfies AuthenticatedUser;
}
