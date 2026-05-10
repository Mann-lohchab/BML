import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { env } from '../config/env';
import { query, withTransaction } from '../db/pool';

export async function createReport(requestedBy: string | null, reportType: string, filterJson: Record<string, unknown>) {
  return withTransaction(async (client) => {
    const request = await client.query<{ id: string }>(
      `
        INSERT INTO report_requests (requested_by, report_type, filter_json, status)
        VALUES ($1, $2, $3, 'queued')
        RETURNING id
      `,
      [requestedBy, reportType, filterJson]
    );

    const requestId = request.rows[0].id;
    await client.query(
      `
        INSERT INTO report_jobs (report_request_id, status, started_at)
        VALUES ($1, 'queued', now())
      `,
      [requestId]
    );

    return requestId;
  });
}

export async function generateReportArtifact(reportRequestId: string) {
  const reportDir = path.resolve(env.SAT_REPORT_DIR);
  fs.mkdirSync(reportDir, { recursive: true });

  const request = await query<{ report_type: string; filter_json: Record<string, unknown> }>(
    'SELECT report_type, filter_json FROM report_requests WHERE id = $1',
    [reportRequestId]
  );
  if (!request.rows[0]) {
    throw new Error('Report request not found');
  }

  const csvPath = path.join(reportDir, `${reportRequestId}.csv`);
  const pdfPath = path.join(reportDir, `${reportRequestId}.pdf`);

  const coaches = await query(
    `
      SELECT c.coach_no, c.coach_name, tl.status, tl.sample_ts, tl.reference_speed
      FROM coaches c
      LEFT JOIN telemetry_latest tl ON tl.coach_id = c.id
      ORDER BY c.coach_no
    `
  );

  const csvLines = ['coach_no,coach_name,status,sample_ts,reference_speed'];
  for (const row of coaches.rows) {
    csvLines.push([
      escapeCsv(String(row.coach_no ?? '')),
      escapeCsv(String(row.coach_name ?? '')),
      escapeCsv(String(row.status ?? '')),
      escapeCsv(String(row.sample_ts ?? '')),
      escapeCsv(String(row.reference_speed ?? ''))
    ].join(','));
  }
  fs.writeFileSync(csvPath, `${csvLines.join('\n')}\n`);

  await writePdf(pdfPath, request.rows[0].report_type, coaches.rows.length);

  await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE report_requests
        SET status = 'completed', updated_at = now()
        WHERE id = $1
      `,
      [reportRequestId]
    );
    await client.query(
      `
        UPDATE report_jobs
        SET status = 'completed', finished_at = now(), updated_at = now()
        WHERE report_request_id = $1
      `,
      [reportRequestId]
    );
    await client.query(
      `
        INSERT INTO report_artifacts (
          report_request_id, file_name, mime_type, storage_path, size_bytes
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        reportRequestId,
        path.basename(csvPath),
        'text/csv',
        csvPath,
        fs.statSync(csvPath).size
      ]
    );
    await client.query(
      `
        INSERT INTO report_artifacts (
          report_request_id, file_name, mime_type, storage_path, size_bytes
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        reportRequestId,
        path.basename(pdfPath),
        'application/pdf',
        pdfPath,
        fs.statSync(pdfPath).size
      ]
    );
  });

  return { csvPath, pdfPath };
}

function escapeCsv(value: string) {
  if (/[,"\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function writePdf(filePath: string, reportType: string, coachCount: number) {
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    doc.fontSize(18).text('SAT Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Report type: ${reportType}`);
    doc.text(`Coach count: ${coachCount}`);
    doc.text(`Generated at: ${new Date().toISOString()}`);
    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
}
