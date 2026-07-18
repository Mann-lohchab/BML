import { useMemo, useState } from 'react';
import { Bell, CheckCheck, MailOpen, MessageSquareText } from 'lucide-react';
import {
  Button,
  EmptyState,
  ErrorState,
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
import type { Notification } from '@/lib/types';

export function NotificationsPage() {
  const { notify } = useToast();
  const notifications = useApi(async () => (await api.get<{ notifications: Notification[] }>('/notifications')).notifications, []);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Notification | null>(null);

  const filtered = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    return (notifications.data ?? []).filter((item) =>
      [item.subject, item.body, item.channel, item.delivery_status].some((value) => value?.toLowerCase().includes(normalized))
    );
  }, [notifications.data, query]);

  async function markRead(notification: Notification) {
    if (notification.read_at) return;
    try {
      await api.patch(`/notifications/${notification.id}/read`);
      notify('Notification marked as read', 'success');
      setSelected((current) => current?.id === notification.id ? { ...current, read_at: new Date().toISOString() } : current);
      await notifications.reload();
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Unable to update notification', 'error');
    }
  }

  async function markAllVisible() {
    const unread = filtered.filter((item) => !item.read_at);
    try {
      await Promise.all(unread.map((item) => api.patch(`/notifications/${item.id}/read`)));
      notify(`${unread.length} notifications marked as read`, 'success');
      await notifications.reload();
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Unable to update notifications', 'error');
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Delivery centre"
        title="Notifications"
        description="Review alert messages, provider state, and read status."
        actions={<Button variant="secondary" onClick={() => void markAllVisible()} disabled={!filtered.some((item) => !item.read_at)}><CheckCheck size={16} />Mark visible read</Button>}
      />
      <Panel
        title="Notification stream"
        description={`${notifications.data?.filter((item) => !item.read_at).length ?? 0} unread messages`}
        icon={<Bell size={18} />}
        actions={<SearchInput placeholder="Search subject or message" value={query} onChange={(event) => setQuery(event.target.value)} />}
      >
        {notifications.loading && !notifications.data ? <LoadingState label="Fetching notifications" /> :
          notifications.error && !notifications.data ? <ErrorState error={notifications.error} onRetry={() => void notifications.reload()} /> :
          filtered.length ? (
            <div className="notification-list">
              {filtered.map((item) => (
                <button
                  className={`notification-row ${item.read_at ? '' : 'is-unread'}`}
                  type="button"
                  key={item.id}
                  onClick={() => { setSelected(item); void markRead(item); }}
                >
                  <span className="notification-row__icon"><MessageSquareText size={18} /></span>
                  <span className="notification-row__body">
                    <span><strong>{item.subject ?? 'BML notification'}</strong>{!item.read_at && <i>New</i>}</span>
                    <small>{item.body}</small>
                  </span>
                  <span className="notification-row__meta">
                    <StatusBadge>{item.delivery_status}</StatusBadge>
                    <time title={formatDateTime(item.created_at)}>{formatRelative(item.created_at)}</time>
                  </span>
                </button>
              ))}
            </div>
          ) : <EmptyState title="No notifications found" description="Messages created by alert events will appear here." />}
      </Panel>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.subject ?? 'BML notification'}
        description={selected ? formatDateTime(selected.created_at) : undefined}
        footer={<Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>}
      >
        {selected && (
          <div className="notification-detail">
            <span className="notification-detail__icon"><MailOpen size={22} /></span>
            <p>{selected.body}</p>
            <dl>
              <div><dt>Channel</dt><dd>{titleCase(selected.channel)}</dd></div>
              <div><dt>Delivery</dt><dd><StatusBadge>{selected.delivery_status}</StatusBadge></dd></div>
              <div><dt>Sent</dt><dd>{formatDateTime(selected.sent_at)}</dd></div>
              <div><dt>Provider ID</dt><dd>{selected.provider_message_id ?? '—'}</dd></div>
            </dl>
          </div>
        )}
      </Modal>
    </div>
  );
}
