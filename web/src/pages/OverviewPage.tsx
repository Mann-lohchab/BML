import { Activity, BellRing, MapPinned, Radio, ShieldAlert, TrainFront, Wifi, WifiOff, Zap } from 'lucide-react';
import { Link } from 'react-router';
import { FleetMap } from '@/components/FleetMap';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
  StatCard,
  StatusBadge
} from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import type { MapPoint, OverviewSummary, Trigger } from '@/lib/types';

type ActivityPayload = {
  telemetry: Array<{
    id: string;
    coach_no: string | null;
    sample_ts: string;
    reference_speed: string | number | null;
    created_at: string;
  }>;
  alerts: Array<{
    id: string;
    coach_no: string | null;
    alert_name: string;
    status: string;
    start_time: string;
    end_time: string | null;
  }>;
};

type OverviewPayload = {
  summary: OverviewSummary;
  points: MapPoint[];
  activity: ActivityPayload;
  triggers: Trigger[];
};

export function OverviewPage() {
  const overview = useApi<OverviewPayload>(async () => {
    const [summary, map, activity, triggers] = await Promise.all([
      api.get<{ summary: OverviewSummary }>('/overview'),
      api.get<{ points: MapPoint[] }>('/overview/map'),
      api.get<ActivityPayload>('/overview/activity'),
      api.get<{ triggers: Trigger[] }>('/overview/triggers')
    ]);
    return {
      summary: summary.summary,
      points: map.points,
      activity,
      triggers: triggers.triggers
    };
  }, []);

  if (overview.loading && !overview.data) return <LoadingState label="Building the fleet picture" />;
  if (overview.error && !overview.data) return <ErrorState error={overview.error} onRetry={() => void overview.reload()} />;
  if (!overview.data) return null;

  const { summary, points, activity, triggers } = overview.data;
  const activeTriggers = triggers.filter((trigger) => trigger.is_active);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Live operations"
        title="Fleet overview"
        description="One view of coach availability, telemetry, locations, and events."
        actions={
          <div className="live-indicator">
            <span className="pulse-dot" />
            Live data
          </div>
        }
      />

      <div className="stat-grid">
        <StatCard label="Total coaches" value={summary.coaches} meta="Registered fleet" icon={<TrainFront size={19} />} />
        <StatCard label="Online now" value={summary.online} meta={`${summary.coaches ? Math.round((summary.online / summary.coaches) * 100) : 0}% availability`} icon={<Wifi size={19} />} tone="green" />
        <StatCard label="Offline" value={summary.offline} meta="Require attention" icon={<WifiOff size={19} />} tone={summary.offline ? 'red' : 'green'} />
        <StatCard label="Active alerts" value={summary.activeAlerts} meta="Open fleet events" icon={<ShieldAlert size={19} />} tone={summary.activeAlerts ? 'amber' : 'green'} />
        <StatCard label="Notification queue" value={summary.queuedNotifications} meta="Awaiting delivery" icon={<BellRing size={19} />} tone="blue" />
      </div>

      <div className="overview-grid">
        <Panel
          title="Fleet location overview"
          description={`${points.filter((point) => point.gps_lat && point.gps_lon).length} coaches reporting coordinates`}
          icon={<MapPinned size={18} />}
          actions={<Link className="text-link" to="/coaches">View coaches</Link>}
          className="overview-grid__map"
        >
          <FleetMap points={points} height={370} />
        </Panel>

        <Panel
          title="Trigger activity"
          description={`${activeTriggers.length} active rules`}
          icon={<Zap size={18} />}
          actions={<Link className="text-link" to="/triggers">Manage</Link>}
        >
          {activeTriggers.length ? (
            <div className="compact-list">
              {activeTriggers.slice(0, 5).map((trigger) => (
                <div className="compact-list__item" key={trigger.id}>
                  <span className={`severity-mark severity-mark--${trigger.severity}`} />
                  <div>
                    <strong>{trigger.name}</strong>
                    <span>{trigger.metric} {trigger.operator} {trigger.threshold ?? 'rule'}</span>
                  </div>
                  <StatusBadge>{trigger.severity}</StatusBadge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No active triggers" description="Enable a rule to monitor the fleet automatically." />
          )}
        </Panel>
      </div>

      <div className="two-column-grid">
        <Panel title="Recent telemetry" description="Latest coach samples" icon={<Activity size={18} />}>
          {activity.telemetry.length ? (
            <div className="activity-feed">
              {activity.telemetry.slice(0, 7).map((item) => (
                <div className="activity-feed__item" key={item.id}>
                  <span className="activity-feed__icon"><Radio size={15} /></span>
                  <div>
                    <strong>Coach {item.coach_no ?? 'Unassigned'}</strong>
                    <span>Reference speed {formatNumber(item.reference_speed)} km/h</span>
                  </div>
                  <time title={formatDateTime(item.created_at)}>{formatRelative(item.created_at)}</time>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No telemetry yet" description="Incoming MQTT samples will appear here." />
          )}
        </Panel>

        <Panel title="Recent alert events" description="Latest state changes" icon={<ShieldAlert size={18} />}>
          {activity.alerts.length ? (
            <div className="activity-feed">
              {activity.alerts.slice(0, 7).map((item) => (
                <div className="activity-feed__item" key={item.id}>
                  <span className="activity-feed__icon activity-feed__icon--alert"><ShieldAlert size={15} /></span>
                  <div>
                    <strong>{item.alert_name}</strong>
                    <span>Coach {item.coach_no ?? 'Unknown'} · {formatDateTime(item.start_time)}</span>
                  </div>
                  <StatusBadge>{item.status}</StatusBadge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No alert activity" description="Fleet events will be recorded here." />
          )}
        </Panel>
      </div>
    </div>
  );
}
