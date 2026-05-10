import express from 'express';
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
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, service: 'sat-express-postgres' });
  });

  app.use('/auth', authRouter);
  app.use('/overview', overviewRouter);
  app.use('/coaches', coachesRouter);
  app.use('/contacts', contactsRouter);
  app.use('/triggers', triggersRouter);
  app.use('/notifications', notificationsRouter);
  app.use('/reports', reportsRouter);
  app.use('/admin', adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
