import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Pencil, Plus, ShieldAlert, Trash2, Zap } from 'lucide-react';
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
import { formatDuration, titleCase } from '@/lib/format';
import type { Trigger } from '@/lib/types';

type TriggerForm = {
  name: string;
  metric: string;
  operator: string;
  threshold: string;
  status_value: string;
  duration_ms: string;
  severity: Trigger['severity'];
  is_active: boolean;
  condition_json: string;
};

const emptyForm: TriggerForm = {
  name: '',
  metric: 'shelling',
  operator: '=',
  threshold: '',
  status_value: 'Active',
  duration_ms: '',
  severity: 'medium',
  is_active: true,
  condition_json: '{}'
};

export function TriggersPage() {
  const { notify } = useToast();
  const triggers = useApi(async () => (await api.get<{ triggers: Trigger[] }>('/triggers')).triggers, []);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Trigger | null>(null);
  const [form, setForm] = useState<TriggerForm>(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    return (triggers.data ?? []).filter((trigger) =>
      [trigger.name, trigger.metric, trigger.severity].some((value) => value.toLowerCase().includes(normalized))
    );
  }, [query, triggers.data]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(trigger: Trigger) {
    setEditing(trigger);
    setForm({
      name: trigger.name,
      metric: trigger.metric,
      operator: trigger.operator,
      threshold: trigger.threshold === null ? '' : String(trigger.threshold),
      status_value: String(trigger.condition_json?.value ?? 'Active'),
      duration_ms: trigger.duration_ms === null ? '' : String(trigger.duration_ms),
      severity: trigger.severity,
      is_active: trigger.is_active,
      condition_json: JSON.stringify(trigger.condition_json ?? {}, null, 2)
    });
    setModalOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      let conditionJson: Record<string, unknown>;
      try {
        conditionJson = JSON.parse(form.condition_json || '{}') as Record<string, unknown>;
      } catch {
        throw new Error('Advanced condition must be valid JSON');
      }
      if (form.metric === 'status') conditionJson = { ...conditionJson, value: form.status_value };
      const payload = {
        name: form.name,
        metric: form.metric,
        operator: form.operator,
        threshold: form.metric === 'status' || form.threshold === '' ? null : Number(form.threshold),
        duration_ms: form.duration_ms === '' ? null : Number(form.duration_ms),
        severity: form.severity,
        condition_json: conditionJson,
        ...(editing ? { is_active: form.is_active } : {})
      };
      if (editing) {
        await api.patch(`/triggers/${editing.id}`, payload);
        notify('Trigger updated', 'success');
      } else {
        await api.post('/triggers', payload);
        notify('Trigger created', 'success');
      }
      setModalOpen(false);
      await triggers.reload();
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Unable to save trigger', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function toggle(trigger: Trigger) {
    try {
      await api.patch(`/triggers/${trigger.id}`, { is_active: !trigger.is_active });
      notify(`${trigger.name} ${trigger.is_active ? 'disabled' : 'enabled'}`, 'success');
      await triggers.reload();
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Unable to update trigger', 'error');
    }
  }

  async function remove(trigger: Trigger) {
    if (!window.confirm(`Delete trigger "${trigger.name}"?`)) return;
    try {
      await api.delete(`/triggers/${trigger.id}`);
      notify('Trigger deleted', 'success');
      await triggers.reload();
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Unable to delete trigger', 'error');
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Rules engine"
        title="Triggers"
        description="Turn shelling, speed, and status conditions into trackable alert events."
        actions={<Button onClick={openCreate}><Plus size={16} />New trigger</Button>}
      />
      <div className="mini-stat-row">
        <div><Zap size={17} /><span>Active rules</span><strong>{triggers.data?.filter((item) => item.is_active).length ?? 0}</strong></div>
        <div><ShieldAlert size={17} /><span>Critical rules</span><strong>{triggers.data?.filter((item) => item.severity === 'critical').length ?? 0}</strong></div>
      </div>
      <Panel
        title="Alert triggers"
        description="Evaluated by the analytics worker against each active coach."
        icon={<Zap size={18} />}
        actions={<SearchInput placeholder="Search trigger or metric" value={query} onChange={(event) => setQuery(event.target.value)} />}
      >
        {triggers.loading && !triggers.data ? <LoadingState label="Fetching triggers" /> :
          triggers.error && !triggers.data ? <ErrorState error={triggers.error} onRetry={() => void triggers.reload()} /> :
          filtered.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>Rule</th><th>Condition</th><th>Duration</th><th>Severity</th><th>State</th><th /></tr></thead>
                <tbody>
                  {filtered.map((trigger) => (
                    <tr key={trigger.id}>
                      <td><div className="table-identity"><span className="table-identity__icon table-identity__icon--alert"><Zap size={17} /></span><div><strong>{trigger.name}</strong><span>{titleCase(trigger.metric)}</span></div></div></td>
                      <td className="rule-expression">
                        {trigger.metric === 'status'
                          ? `status ${trigger.operator} ${String(trigger.condition_json?.value ?? '—')}`
                          : trigger.metric === 'shelling'
                            ? 'shelling detected'
                            : `${trigger.metric} ${trigger.operator} ${trigger.threshold ?? '—'}`}
                      </td>
                      <td>{trigger.duration_ms ? formatDuration(trigger.duration_ms) : 'Immediate'}</td>
                      <td><StatusBadge>{trigger.severity}</StatusBadge></td>
                      <td>
                        <label className="inline-toggle" title={trigger.is_active ? 'Disable trigger' : 'Enable trigger'}>
                          <input type="checkbox" checked={trigger.is_active} onChange={() => void toggle(trigger)} />
                          <span />
                        </label>
                      </td>
                      <td><div className="row-actions"><button type="button" className="icon-button" onClick={() => openEdit(trigger)} aria-label={`Edit ${trigger.name}`}><Pencil size={16} /></button><button type="button" className="icon-button icon-button--danger" onClick={() => void remove(trigger)} aria-label={`Delete ${trigger.name}`}><Trash2 size={16} /></button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No triggers found" description="Create a rule to begin monitoring coach telemetry." action={<Button size="sm" onClick={openCreate}><Plus size={15} />New trigger</Button>} />}
      </Panel>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit trigger' : 'Create trigger'}
        description="Define when BML should open and close an alert event."
        width="lg"
        footer={<><Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit" form="trigger-form" disabled={saving}>{saving ? 'Saving' : editing ? 'Save changes' : 'Create trigger'}</Button></>}
      >
        <form id="trigger-form" className="form-grid form-grid--two" onSubmit={save}>
          <Field label="Rule name"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="High reference speed" required /></Field>
          <Field label="Metric">
            <select value={form.metric} onChange={(event) => setForm({ ...form, metric: event.target.value })}>
              <option value="shelling">Shelling detected</option>
              <option value="reference_speed">Reference speed</option>
              <option value="status">Coach status</option>
              <option value="custom">Custom condition</option>
            </select>
          </Field>
          <Field label="Operator">
            <select value={form.operator} onChange={(event) => setForm({ ...form, operator: event.target.value })}>
              {form.metric === 'shelling' ? <option value="=">is detected</option> : <>
                <option value=">">greater than</option><option value=">=">greater or equal</option><option value="<">less than</option><option value="<=">less or equal</option><option value="=">equals</option><option value="!=">does not equal</option>
              </>}
            </select>
          </Field>
          {form.metric === 'status' ? (
            <Field label="Status value"><select value={form.status_value} onChange={(event) => setForm({ ...form, status_value: event.target.value })}><option value="Active">Active</option><option value="Idle">Idle</option><option value="Off">Off</option></select></Field>
          ) : form.metric !== 'shelling' ? (
            <Field label="Threshold"><input type="number" step="any" value={form.threshold} onChange={(event) => setForm({ ...form, threshold: event.target.value })} placeholder="0" /></Field>
          ) : <div />}
          <Field label="Minimum duration" hint="Milliseconds; leave blank for immediate evaluation."><input type="number" min="1" value={form.duration_ms} onChange={(event) => setForm({ ...form, duration_ms: event.target.value })} placeholder="Immediate" /></Field>
          <Field label="Severity"><select value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value as Trigger['severity'] })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></Field>
          {editing && <label className="switch-field form-grid__span"><span><strong>Rule active</strong><small>Include this rule in analytics evaluation</small></span><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /></label>}
          <Field label="Advanced condition JSON" hint="Optional metadata used by custom rules.">
            <textarea rows={5} value={form.condition_json} onChange={(event) => setForm({ ...form, condition_json: event.target.value })} spellCheck={false} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
