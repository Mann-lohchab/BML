import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import pino from 'pino';
import { authRouter } from './routes/auth';
import { overviewRouter } from './routes/overview';
import { coachesRouter } from './routes/coaches';
import { contactsRouter } from './routes/contacts';
import { triggersRouter } from './routes/triggers';
import { notificationsRouter } from './routes/notifications';
import { reportsRouter } from './routes/reports';
import { adminRouter } from './routes/admin';
import { errorHandler, notFoundHandler } from './middleware/error-handler';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

export function createApp() {
  const app = express();

  app.use(
    pinoHttp({
      logger
    })
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          imgSrc: ["'self'", 'data:', 'https://*.tile.openstreetmap.org']
        }
      }
    })
  );
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get(['/healthz', '/api/healthz'], (_req, res) => {
    res.json({ ok: true, service: 'bml-rail-operations' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/overview', overviewRouter);
  app.use('/api/coaches', coachesRouter);
  app.use('/api/contacts', contactsRouter);
  app.use('/api/triggers', triggersRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/admin', adminRouter);

  if (process.env.NODE_ENV === 'production') {
    const webDir = path.resolve(__dirname, '../dist-web');
    if (fs.existsSync(webDir)) {
      app.use(express.static(webDir));
      app.get(/.*/, (req, res, next) => {
        if (req.path.startsWith('/api/') || req.method !== 'GET' || !req.accepts('html')) {
          return next();
        }
        return res.sendFile(path.join(webDir, 'index.html'));
      });
    }
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
