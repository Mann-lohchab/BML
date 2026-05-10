import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { forbidden, unauthorized } from '../lib/errors';
import { loadUserById } from '../services/auth-service';

type JwtPayload = {
  sub?: string;
};

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw unauthorized();
    }

    const token = header.slice('Bearer '.length);
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    if (!decoded.sub) {
      throw unauthorized();
    }

    req.user = await loadUserById(decoded.sub);
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(unauthorized());
    }
    if (roles.length > 0 && !roles.some((role) => req.user?.roles.includes(role))) {
      return next(forbidden());
    }
    return next();
  };
}
