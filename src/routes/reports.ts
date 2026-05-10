import fs from 'node:fs';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { notFound } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { query } from '../db/pool';
import { createReport } from '../services/report-service';

export const reportsRouter = Router();

type ReportWithArtifactRow = {
  id: string;
  requested_by: string;
  report_type: string;
  filter_json: Record<string, unknown>;
  status: string;
  requested_at: Date;
  updated_at: Date;
  file_name: string | null;
  mime_type: string | null;
  storage_path: string | null;
};

type ReportArtifactRow = {
  mime_type: string;
  storage_path: string;
  file_name: string;
};

reportsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        report_type: z.string().min(1),
        filter_json: z.record(z.unknown()).default({})
      })
      .parse(req.body);
    const reportId = await createReport(req.user!.id, body.report_type, body.filter_json);
    res.status(201).json({ report_id: reportId });
  })
);

reportsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const result = await query(
      `
        SELECT id, requested_by, report_type, filter_json, status, requested_at, updated_at
        FROM report_requests
        ORDER BY requested_at DESC
      `
    );
    res.json({ reports: result.rows });
  })
);

reportsRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await query<ReportWithArtifactRow>(
      `
        SELECT rr.*, ra.file_name, ra.mime_type, ra.storage_path
        FROM report_requests rr
        LEFT JOIN report_artifacts ra ON ra.report_request_id = rr.id
        WHERE rr.id = $1
      `,
      [req.params.id]
    );
    const report = result.rows[0];
    if (!report) throw notFound('Report not found');
    res.json({ report });
  })
);

reportsRouter.get(
  '/:id/download',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await query<ReportArtifactRow>(
      `
        SELECT mime_type, storage_path, file_name
        FROM report_artifacts
        WHERE report_request_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [req.params.id]
    );
    const artifact = result.rows[0];
    if (!artifact || !fs.existsSync(artifact.storage_path)) {
      throw notFound('Report artifact not found');
    }
    res.type(artifact.mime_type).download(artifact.storage_path, artifact.file_name);
  })
);
