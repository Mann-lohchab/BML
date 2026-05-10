import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { notFound } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { listNotifications, markNotificationRead } from '../services/alert-service';
import { z } from 'zod';

export const notificationsRouter = Router();

function getRouteParam(value: string | string[] | undefined, name: string) {
  return z.string().min(1, `${name} is required`).parse(value);
}

notificationsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ notifications: await listNotifications(req.user!.id) });
  })
);

notificationsRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const notifications = await listNotifications(req.user!.id);
    const notificationId = getRouteParam(req.params.id, 'id');
    const notification = notifications.find((item) => item.id === notificationId);
    if (!notification) throw notFound('Notification not found');
    res.json({ notification });
  })
);

notificationsRouter.patch(
  '/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await markNotificationRead(getRouteParam(req.params.id, 'id'));
    if (!result) throw notFound('Notification not found');
    res.json({ ok: true });
  })
);
