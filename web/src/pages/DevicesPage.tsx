import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Cpu, Pencil, Plus, RadioTower } from 'lucide-react';
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
import { formatRelative } from '@/lib/format';
import type { Device } from '@/lib/types';

type DeviceForm = { ced_no: string; serial_no: string; firmware_version: string; is_active: boolean };
const emptyForm: DeviceForm = { ced_no: '', serial_no: '', firmware_version: '', is_active: true };

export function DevicesPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const devices = useApi(async () => (await api.get<{ devices: Device[] }>('/admin/devices')).devices, []);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Device | null>(null);
  const [form, setForm] = useState<DeviceForm>(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const canManage = user?.roles.some((role) => role === 'admin' || role === 'operator');

  const filtered = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    return (devices.data ?? []).filter((device) =>
      [device.ced_no, device.serial_no, device.firmware_version, device.status].some((value) => value?.toLowerCase().includes(normalized))
    );
  }, [devices.data, query]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(device: Device) {
    setEditing(device);
    setForm({
      ced_no: device.ced_no,
      serial_no: device.serial_no ?? '',
      firmware_version: device.firmware_version ?? '',
      is_active: device.is_active
    });
    setModalOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/admin/ced-devices/${editing.id}`, {
          serial_no: form.serial_no || null,
          firmware_version: form.firmware_version || null,
          is_active: form.is_active
        });
        notify('CED device updated', 'success');
      } else {
        await api.post('/admin/ced-devices', {
          ced_no: form.ced_no,
          serial_no: form.serial_no || null,
          firmware_version: form.firmware_version || null
        });
        notify('CED device registered', 'success');
      }
      setModalOpen(false);
      await devices.reload();
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Unable to save device', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return (
      <div className="page-stack">
        <PageHeader eyebrow="Administration" title="CED devices" description="Device registry and connectivity." />
        <Panel><ErrorState error="Your account needs the admin or operator role to access device management." /></Panel>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Edge connectivity"
        title="CED devices"
        description="Register coach edge devices and monitor their latest connection state."
        actions={<Button onClick={openCreate}><Plus size={16} />Register CED</Button>}
      />
      <Panel
        title="Device registry"
        description={`${devices.data?.length ?? 0} registered devices`}
        icon={<RadioTower size={18} />}
        actions={<SearchInput placeholder="Search CED, serial, or firmware" value={query} onChange={(event) => setQuery(event.target.value)} />}
      >
        {devices.loading && !devices.data ? <LoadingState label="Fetching CED devices" /> :
          devices.error && !devices.data ? <ErrorState error={devices.error} onRetry={() => void devices.reload()} /> :
          filtered.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>CED number</th><th>Serial</th><th>Firmware</th><th>Connectivity</th><th>Registry state</th><th>Last seen</th><th /></tr></thead>
                <tbody>
                  {filtered.map((device) => (
                    <tr key={device.id}>
                      <td><div className="table-identity"><span className="table-identity__icon"><Cpu size={17} /></span><div><strong>{device.ced_no}</strong><span>Coach edge device</span></div></div></td>
                      <td>{device.serial_no ?? '—'}</td>
                      <td>{device.firmware_version ?? '—'}</td>
                      <td><StatusBadge>{device.status ?? 'No data'}</StatusBadge></td>
                      <td><StatusBadge>{device.is_active ? 'Enabled' : 'Disabled'}</StatusBadge></td>
                      <td>{formatRelative(device.last_seen_at)}</td>
                      <td><button type="button" className="icon-button" onClick={() => openEdit(device)} aria-label={`Edit ${device.ced_no}`}><Pencil size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No devices found" description="Register a CED device or wait for the first inbound packet." action={<Button size="sm" onClick={openCreate}><Plus size={15} />Register CED</Button>} />}
      </Panel>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit CED device' : 'Register CED device'}
        footer={<><Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit" form="device-form" disabled={saving}>{saving ? 'Saving' : 'Save device'}</Button></>}
      >
        <form id="device-form" className="form-grid" onSubmit={save}>
          <Field label="CED number"><input value={form.ced_no} onChange={(event) => setForm({ ...form, ced_no: event.target.value })} disabled={Boolean(editing)} required /></Field>
          <Field label="Serial number"><input value={form.serial_no} onChange={(event) => setForm({ ...form, serial_no: event.target.value })} placeholder="Optional" /></Field>
          <Field label="Firmware version"><input value={form.firmware_version} onChange={(event) => setForm({ ...form, firmware_version: event.target.value })} placeholder="Optional" /></Field>
          {editing && <label className="switch-field"><span><strong>Device active</strong><small>Allow this device in the registry</small></span><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /></label>}
        </form>
      </Modal>
    </div>
  );
}
