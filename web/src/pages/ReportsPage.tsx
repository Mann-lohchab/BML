import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Download, Eye, FileBarChart2, FileClock, Plus } from 'lucide-react';
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  PageHeader,
  Panel,
  SearchInput,
  StatusBadge
} from '@/components/ui';
import { useToast } from '@/context/ToastContext';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { formatDateTime, formatRelative, titleCase } from '@/lib/format';
import type { Report } from '@/lib/types';

export function ReportsPage() {
  const { notify } = useToast();
  const reports = useApi(async () => (await api.get<{ reports: Report[] }>('/reports')).reports, []);
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Report | null>(null);
  const [reportType, setReportType] = useState('fleet_status');
  const [filterJson, setFilterJson] = useState('{}');
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    return (reports.data ?? []).filter((report) =>
      [report.report_type, report.status, report.id].some((value) => value.toLowerCase().includes(normalized))
    );
  }, [reports.data, query]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(filterJson) as Record<string, unknown>;
      } catch {
        throw new Error('Report filters must be valid JSON');
      }
      await api.post('/reports', { report_type: reportType, filter_json: parsed });
      notify('Report request queued', 'success');
      setModalOpen(false);
      await reports.reload();
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Unable to request report', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function openDetails(report: Report) {
    try {
      const response = await api.get<{ report: Report }>(`/reports/${report.id}`);
      setSelected(response.report);
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Unable to load report details', 'error');
    }
  }

  async function download(report: Report) {
    try {
      await api.download(`/reports/${report.id}/download`, `bml-${report.report_type}.pdf`);
      notify('Report download started', 'success');
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Unable to download report', 'error');
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Operational records"
        title="Reports"
        description="Queue, track, inspect, and download fleet report artifacts."
        actions={<Button onClick={() => setModalOpen(true)}><Plus size={16} />Generate report</Button>}
      />
      <div className="mini-stat-row">
        <div><FileBarChart2 size={17} /><span>Completed</span><strong>{reports.data?.filter((item) => item.status === 'completed').length ?? 0}</strong></div>
        <div><FileClock size={17} /><span>In queue</span><strong>{reports.data?.filter((item) => item.status !== 'completed').length ?? 0}</strong></div>
      </div>
      <Panel
        title="Generated reports"
        description="Report requests and available artifacts."
        icon={<FileBarChart2 size={18} />}
        actions={<SearchInput placeholder="Search type, status, or ID" value={query} onChange={(event) => setQuery(event.target.value)} />}
      >
        {reports.loading && !reports.data ? <LoadingState label="Fetching reports" /> :
          reports.error && !reports.data ? <ErrorState error={reports.error} onRetry={() => void reports.reload()} /> :
          filtered.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>Report</th><th>Request ID</th><th>Status</th><th>Requested</th><th>Updated</th><th /></tr></thead>
                <tbody>
                  {filtered.map((report) => (
                    <tr key={report.id}>
                      <td><div className="table-identity"><span className="table-identity__icon"><FileBarChart2 size={17} /></span><div><strong>{titleCase(report.report_type)}</strong><span>BML generated artifact</span></div></div></td>
                      <td><code className="short-id">{report.id.slice(0, 8)}</code></td>
                      <td><StatusBadge>{report.status}</StatusBadge></td>
                      <td>{formatDateTime(report.requested_at)}</td>
                      <td>{formatRelative(report.updated_at)}</td>
                      <td><div className="row-actions"><button className="icon-button" type="button" onClick={() => void openDetails(report)} aria-label="View report details"><Eye size={16} /></button><button className="icon-button" type="button" disabled={report.status !== 'completed'} onClick={() => void download(report)} aria-label="Download report"><Download size={16} /></button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No reports found" description="Generate a report to create a CSV and PDF artifact." action={<Button size="sm" onClick={() => setModalOpen(true)}><Plus size={15} />Generate report</Button>} />}
      </Panel>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Generate report"
        description="The report worker will create downloadable artifacts."
        footer={<><Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit" form="report-form" disabled={saving}>{saving ? 'Queuing' : 'Queue report'}</Button></>}
      >
        <form id="report-form" className="form-grid" onSubmit={create}>
          <Field label="Report type"><select value={reportType} onChange={(event) => setReportType(event.target.value)}><option value="fleet_status">Fleet status</option><option value="shelling_index">Shelling index</option><option value="alert_history">Alert history</option><option value="coach_telemetry">Coach telemetry</option></select></Field>
          <Field label="Filter JSON" hint="Optional report selection metadata."><textarea rows={7} value={filterJson} onChange={(event) => setFilterJson(event.target.value)} spellCheck={false} /></Field>
        </form>
      </Modal>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? titleCase(selected.report_type) : 'Report'}
        description={selected ? `Requested ${formatDateTime(selected.requested_at)}` : undefined}
        footer={selected && <><Button variant="ghost" onClick={() => setSelected(null)}>Close</Button><Button disabled={selected.status !== 'completed'} onClick={() => void download(selected)}><Download size={16} />Download</Button></>}
      >
        {selected && <div className="report-detail"><dl><div><dt>Status</dt><dd><StatusBadge>{selected.status}</StatusBadge></dd></div><div><dt>Request ID</dt><dd><code>{selected.id}</code></dd></div><div><dt>File</dt><dd>{selected.file_name ?? 'Artifact pending'}</dd></div><div><dt>Type</dt><dd>{selected.mime_type ?? '—'}</dd></div></dl><div><strong>Filters</strong><pre>{JSON.stringify(selected.filter_json, null, 2)}</pre></div></div>}
      </Modal>
    </div>
  );
}
