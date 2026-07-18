import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowUpRight, Pencil, Plus, RadioTower, TrainFront } from 'lucide-react';
import { Link } from 'react-router';
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
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { formatNumber, formatRelative } from '@/lib/format';
import type { Coach } from '@/lib/types';

type CoachForm = { coach_no: string; coach_name: string; line_name: string; is_active: boolean };
const emptyForm: CoachForm = { coach_no: '', coach_name: '', line_name: '', is_active: true };

export function CoachesPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const coaches = useApi(async () => (await api.get<{ coaches: Coach[] }>('/coaches')).coaches, []);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<CoachForm>(emptyForm);
  const [editing, setEditing] = useState<Coach | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const canManage = user?.roles.some((role) => role === 'admin' || role === 'operator');

  const filtered = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    return (coaches.data ?? []).filter((coach) =>
      [coach.coach_no, coach.coach_name, coach.line_name].some((value) => value?.toLowerCase().includes(normalized))
    );
  }, [coaches.data, query]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(coach: Coach) {
    setEditing(coach);
    setForm({
      coach_no: coach.coach_no,
      coach_name: coach.coach_name,
      line_name: coach.line_name ?? '',
      is_active: coach.is_active
    });
    setModalOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/admin/coaches/${editing.id}`, {
          coach_name: form.coach_name,
          line_name: form.line_name || null,
          is_active: form.is_active
        });
        notify('Coach details updated', 'success');
      } else {
        await api.post('/admin/coaches', {
          coach_no: form.coach_no,
          coach_name: form.coach_name,
          line_name: form.line_name || null
        });
        notify('Coach added to the fleet', 'success');
      }
      setModalOpen(false);
      await coaches.reload();
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Unable to save coach', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Fleet registry"
        title="Coaches"
        description="Search the fleet, inspect current operating state, and open coach-level analytics."
        actions={canManage ? <Button onClick={openCreate}><Plus size={16} />Add coach</Button> : undefined}
      />
      <Panel
        title="Registered coaches"
        description={`${coaches.data?.length ?? 0} fleet records`}
        icon={<TrainFront size={18} />}
        actions={<SearchInput placeholder="Search coach, name, or line" value={query} onChange={(event) => setQuery(event.target.value)} />}
      >
        {coaches.loading && !coaches.data ? <LoadingState label="Fetching coaches" /> :
          coaches.error && !coaches.data ? <ErrorState error={coaches.error} onRetry={() => void coaches.reload()} /> :
          filtered.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Coach</th>
                    <th>Line</th>
                    <th>Connection</th>
                    <th>Operating state</th>
                    <th>Reference speed</th>
                    <th>Last sample</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((coach) => (
                    <tr key={coach.id}>
                      <td>
                        <div className="table-identity">
                          <span className="table-identity__icon"><TrainFront size={17} /></span>
                          <div><strong>{coach.coach_name}</strong><span>#{coach.coach_no}</span></div>
                        </div>
                      </td>
                      <td>{coach.line_name ?? 'Unassigned'}</td>
                      <td><StatusBadge>{coach.online ? 'Online' : 'Offline'}</StatusBadge></td>
                      <td><StatusBadge>{coach.latest_status ?? 'No data'}</StatusBadge></td>
                      <td className="metric-cell">{formatNumber(coach.reference_speed)} <small>km/h</small></td>
                      <td>{formatRelative(coach.latest_sample_ts)}</td>
                      <td>
                        <div className="row-actions">
                          {canManage && <button type="button" className="icon-button" onClick={() => openEdit(coach)} aria-label={`Edit ${coach.coach_name}`}><Pencil size={16} /></button>}
                          <Link className="icon-button" to={`/coaches/${coach.id}`} aria-label={`Open ${coach.coach_name}`}><ArrowUpRight size={17} /></Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title={query ? 'No coaches match your search' : 'No coaches registered'}
              description={query ? 'Try a different coach number, name, or line.' : 'Coaches will be added automatically on first telemetry or can be created manually.'}
              action={!query && canManage ? <Button size="sm" onClick={openCreate}><Plus size={15} />Add coach</Button> : undefined}
            />
          )}
      </Panel>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit coach' : 'Add coach'}
        description={editing ? `Update ${editing.coach_name}` : 'Create a new fleet record.'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" form="coach-form" disabled={saving}>{saving ? 'Saving' : editing ? 'Save changes' : 'Add coach'}</Button>
          </>
        }
      >
        <form id="coach-form" className="form-grid" onSubmit={handleSubmit}>
          <Field label="Coach number">
            <input value={form.coach_no} onChange={(event) => setForm({ ...form, coach_no: event.target.value })} disabled={Boolean(editing)} required />
          </Field>
          <Field label="Coach name">
            <input value={form.coach_name} onChange={(event) => setForm({ ...form, coach_name: event.target.value })} required />
          </Field>
          <Field label="Line name">
            <input value={form.line_name} onChange={(event) => setForm({ ...form, line_name: event.target.value })} placeholder="Optional operating line" />
          </Field>
          {editing && <label className="switch-field"><span><strong>Coach active</strong><small>Include this coach in fleet operations</small></span><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /></label>}
          <div className="form-note"><RadioTower size={16} />A coach may also be created and linked automatically when its first CED packet arrives.</div>
        </form>
      </Modal>
    </div>
  );
}
