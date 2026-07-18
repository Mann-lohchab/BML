import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ContactRound, Mail, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
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
import { formatRelative, initials } from '@/lib/format';
import type { Contact } from '@/lib/types';

type ContactForm = { name: string; email: string; phone: string; preferred_channel: 'email' | 'sms'; is_active: boolean };
const emptyForm: ContactForm = { name: '', email: '', phone: '', preferred_channel: 'email', is_active: true };

export function ContactsPage() {
  const { notify } = useToast();
  const contacts = useApi(async () => (await api.get<{ contacts: Contact[] }>('/contacts')).contacts, []);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState<ContactForm>(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    return (contacts.data ?? []).filter((contact) =>
      [contact.name, contact.email, contact.phone].some((value) => value?.toLowerCase().includes(normalized))
    );
  }, [contacts.data, query]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(contact: Contact) {
    setEditing(contact);
    setForm({
      name: contact.name,
      email: contact.email ?? '',
      phone: contact.phone ?? '',
      preferred_channel: contact.preferred_channel,
      is_active: contact.is_active
    });
    setModalOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        email: form.email || null,
        phone: form.phone || null,
        preferred_channel: form.preferred_channel,
        ...(editing ? { is_active: form.is_active } : {})
      };
      if (editing) {
        await api.patch(`/contacts/${editing.id}`, payload);
        notify('Contact updated', 'success');
      } else {
        await api.post('/contacts', payload);
        notify('Contact created', 'success');
      }
      setModalOpen(false);
      await contacts.reload();
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Unable to save contact', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(contact: Contact) {
    if (!window.confirm(`Delete contact "${contact.name}"?`)) return;
    try {
      await api.delete(`/contacts/${contact.id}`);
      notify('Contact deleted', 'success');
      await contacts.reload();
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Unable to delete contact', 'error');
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Escalation directory"
        title="Contacts"
        description="Maintain the people and channels used for operational communication."
        actions={<Button onClick={openCreate}><Plus size={16} />Add contact</Button>}
      />
      <Panel
        title="Contact directory"
        description={`${contacts.data?.filter((contact) => contact.is_active).length ?? 0} active recipients`}
        icon={<ContactRound size={18} />}
        actions={<SearchInput placeholder="Search name, email, or phone" value={query} onChange={(event) => setQuery(event.target.value)} />}
      >
        {contacts.loading && !contacts.data ? <LoadingState label="Fetching contacts" /> :
          contacts.error && !contacts.data ? <ErrorState error={contacts.error} onRetry={() => void contacts.reload()} /> :
          filtered.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>Contact</th><th>Email</th><th>Phone</th><th>Preferred channel</th><th>State</th><th>Updated</th><th /></tr></thead>
                <tbody>
                  {filtered.map((contact) => (
                    <tr key={contact.id}>
                      <td><div className="table-identity"><span className="avatar avatar--table">{initials(contact.name)}</span><div><strong>{contact.name}</strong><span>Operations contact</span></div></div></td>
                      <td>{contact.email ? <a className="table-link" href={`mailto:${contact.email}`}><Mail size={14} />{contact.email}</a> : '—'}</td>
                      <td>{contact.phone ? <a className="table-link" href={`tel:${contact.phone}`}><Phone size={14} />{contact.phone}</a> : '—'}</td>
                      <td><StatusBadge tone="teal">{contact.preferred_channel.toUpperCase()}</StatusBadge></td>
                      <td><StatusBadge>{contact.is_active ? 'Enabled' : 'Disabled'}</StatusBadge></td>
                      <td>{formatRelative(contact.updated_at)}</td>
                      <td><div className="row-actions"><button className="icon-button" type="button" onClick={() => openEdit(contact)} aria-label={`Edit ${contact.name}`}><Pencil size={16} /></button><button className="icon-button icon-button--danger" type="button" onClick={() => void remove(contact)} aria-label={`Delete ${contact.name}`}><Trash2 size={16} /></button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No contacts found" description="Add a recipient for alert and operations communications." action={<Button size="sm" onClick={openCreate}><Plus size={15} />Add contact</Button>} />}
      </Panel>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit contact' : 'Add contact'}
        footer={<><Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit" form="contact-form" disabled={saving}>{saving ? 'Saving' : 'Save contact'}</Button></>}
      >
        <form id="contact-form" className="form-grid" onSubmit={save}>
          <Field label="Full name"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
          <Field label="Email address"><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
          <Field label="Phone number"><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
          <Field label="Preferred channel"><select value={form.preferred_channel} onChange={(event) => setForm({ ...form, preferred_channel: event.target.value as ContactForm['preferred_channel'] })}><option value="email">Email</option><option value="sms">SMS</option></select></Field>
          {editing && <label className="switch-field"><span><strong>Contact active</strong><small>Available for notification targeting</small></span><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /></label>}
        </form>
      </Modal>
    </div>
  );
}
