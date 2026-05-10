import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/errors';

// Not found Error 
export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, 'Route not found'));
}

// Any else Error 

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  const httpError = error instanceof HttpError ? error : new HttpError(500, 'Internal server error');
  const payload = {
    error: httpError.message,
    details: httpError.details ?? undefined
  };
  res.status(httpError.status).json(payload);
}
