import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  Gauge,
  MapPinned,
  RadioTower,
  ShieldAlert,
  TrainFront,
  Waves
} from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import { FleetMap } from '@/components/FleetMap';
import { TelemetryChart } from '@/components/TelemetryChart';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
  StatCard,
  StatusBadge,
  Tabs
} from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { ApiError, api, toQuery } from '@/lib/api';
import { formatDateTime, formatDuration, formatNumber, formatRelative } from '@/lib/format';
import type {
  Alert,
  Coach,
  LocationPoint,
  MapPoint,
  ShellingIndex,
  TelemetryLatest,
  TelemetrySample
} from '@/lib/types';

type CoachPayload = {
  coach: Coach;
  latest: TelemetryLatest | null;
  samples: TelemetrySample[];
  valveState: {
    valve_states_json: Record<string, boolean | null>;
    axle_speeds_json: Array<number | string>;
    status: string;
    sample_ts: string;
  } | null;
  activeAlerts: Alert[];
  alertHistory: Alert[];
  shelling: ShellingIndex[];
  locations: LocationPoint[];
};

const tabs = [
  { id: 'parameters', label: 'Parameters' },
  { id: 'trends', label: 'Trends' },
  { id: 'valves', label: 'Valve status' },
  { id: 'active-alerts', label: 'Active alerts' },
  { id: 'history', label: 'Historical alerts' },
  { id: 'shelling', label: 'Shelling index' },
  { id: 'location', label: 'Location history' }
];

const today = new Date().toISOString().slice(0, 10);

export function CoachDetailPage() {
  const { coachId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') ?? 'parameters';
  const activeTab = tabs.some((tab) => tab.id === requestedTab) ? requestedTab : 'parameters';
  const [hours, setHours] = useState(24);
  const [shellingDate, setShellingDate] = useState(today);

  const data = useApi<CoachPayload>(async () => {
    const tolerateNotFound = async <T,>(promise: Promise<T>, fallback: T) => {
      try {
        return await promise;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return fallback;
        throw error;
      }
    };

    const [coach, latest, trends, valves, activeAlerts, history, shelling, locations] = await Promise.all([
      api.get<{ coach: Coach }>(`/coaches/${coachId}`),
      tolerateNotFound(
        api.get<{ latest: TelemetryLatest | null }>(`/coaches/${coachId}/latest`),
        { latest: null }
      ),
      api.get<{ samples: TelemetrySample[] }>(`/coaches/${coachId}/trends${toQuery({ hours })}`),
      tolerateNotFound(
        api.get<{ valves: CoachPayload['valveState'] }>(`/coaches/${coachId}/valves`),
        { valves: null }
      ),
      api.get<{ alerts: Alert[] }>(`/coaches/${coachId}/alerts/active`),
      api.get<{ alerts: Alert[] }>(`/coaches/${coachId}/alerts/history`),
      api.get<{ shelling: ShellingIndex[] }>(`/coaches/${coachId}/shelling${toQuery({ date: shellingDate })}`),
      api.get<{ points: LocationPoint[] }>(`/coaches/${coachId}/location-history${toQuery({ hours })}`)
    ]);
    return {
      coach: coach.coach,
      latest: latest.latest,
      samples: trends.samples,
      valveState: valves.valves,
      activeAlerts: activeAlerts.alerts,
      alertHistory: history.alerts,
      shelling: shelling.shelling,
      locations: locations.points
    };
  }, [coachId, hours, shellingDate]);

  if (data.loading && !data.data) return <LoadingState label="Opening coach intelligence" />;
  if (data.error && !data.data) return <ErrorState error={data.error} onRetry={() => void data.reload()} />;
  if (!data.data) return null;

  const payload = data.data;
  const coach = payload.coach;
  const latest = payload.latest;
  const axleSpeeds = latest?.axle_speeds_json ?? coach.axle_speeds_json ?? [];
  const mapPoint: MapPoint = {
    id: coach.id,
    coach_no: coach.coach_no,
    coach_name: coach.coach_name,
    status: latest?.status ?? coach.latest_status ?? null,
    online: latest?.online ?? coach.online ?? false,
    active: latest?.active ?? coach.active ?? false,
    off: latest?.off ?? coach.off ?? true,
    gps_lon: latest?.gps_lon ?? coach.gps_lon ?? null,
    gps_lat: latest?.gps_lat ?? coach.gps_lat ?? null,
    gps_alt: latest?.gps_alt ?? coach.gps_alt ?? null,
    sample_ts: latest?.sample_ts ?? coach.latest_sample_ts ?? null,
    reference_speed: latest?.reference_speed ?? coach.reference_speed ?? null
  };

  function setTab(tab: string) {
    setSearchParams(tab === 'parameters' ? {} : { tab });
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Coach intelligence"
        title={coach.coach_name}
        description={`Coach #${coach.coach_no}${coach.line_name ? ` · ${coach.line_name}` : ''}`}
        actions={<Link className="button button--secondary button--md" to="/coaches"><ArrowLeft size={16} />All coaches</Link>}
      />

      <div className="coach-layout">
        <aside className="coach-summary">
          <Panel>
            <div className="coach-summary__heading">
              <span className="coach-summary__icon"><TrainFront size={23} /></span>
              <div><strong>{coach.coach_name}</strong><span>#{coach.coach_no}</span></div>
              <StatusBadge>{latest?.online ? 'Online' : 'Offline'}</StatusBadge>
            </div>
            <dl className="coach-summary__facts">
              <div><dt>Operating state</dt><dd><StatusBadge>{latest?.status ?? coach.latest_status ?? 'No data'}</StatusBadge></dd></div>
              <div><dt>Reference speed</dt><dd>{formatNumber(latest?.reference_speed ?? coach.reference_speed)} km/h</dd></div>
              <div><dt>CED device</dt><dd>{latest?.ced_device_id ? latest.ced_device_id.slice(0, 8) : 'Unassigned'}</dd></div>
              <div><dt>Last update</dt><dd>{formatRelative(latest?.sample_ts ?? coach.latest_sample_ts)}</dd></div>
            </dl>
            <FleetMap points={[mapPoint]} height={238} compact />
            <div className="coordinate-strip">
              <MapPinned size={14} />
              <span>{formatNumber(mapPoint.gps_lat, 5)}, {formatNumber(mapPoint.gps_lon, 5)}</span>
            </div>
          </Panel>
        </aside>

        <section className="coach-workspace">
          <Tabs tabs={tabs} active={activeTab} onChange={setTab} />
          {data.loading && <div className="inline-refresh"><span className="pulse-dot" />Refreshing telemetry</div>}

          {activeTab === 'parameters' && (
            <ParametersTab latest={latest} axleSpeeds={axleSpeeds} activeAlerts={payload.activeAlerts.length} />
          )}
          {activeTab === 'trends' && (
            <TrendsTab samples={payload.samples} hours={hours} setHours={setHours} />
          )}
          {activeTab === 'valves' && (
            <ValvesTab valveState={payload.valveState} />
          )}
          {activeTab === 'active-alerts' && (
            <AlertsTab alerts={payload.activeAlerts} emptyTitle="No active alerts" emptyDescription="This coach currently has no open events." />
          )}
          {activeTab === 'history' && (
            <AlertsTab alerts={payload.alertHistory} emptyTitle="No historical alerts" emptyDescription="Closed and previous events will appear here." />
          )}
          {activeTab === 'shelling' && (
            <ShellingTab shelling={payload.shelling} date={shellingDate} setDate={setShellingDate} />
          )}
          {activeTab === 'location' && (
            <LocationTab coach={coach} latest={latest} points={payload.locations} hours={hours} setHours={setHours} />
          )}
        </section>
      </div>
    </div>
  );
}

function ParametersTab({
  latest,
  axleSpeeds,
  activeAlerts
}: {
  latest: TelemetryLatest | null;
  axleSpeeds: Array<number | string>;
  activeAlerts: number;
}) {
  return (
    <div className="tab-stack">
      <div className="parameter-grid">
        {[0, 1, 2, 3].map((index) => (
          <article className="parameter-card" key={index}>
            <span><Activity size={18} /></span>
            <div><small>Linear speed · Axle {index + 1}</small><strong>{formatNumber(axleSpeeds[index])}</strong><em>km/h</em></div>
          </article>
        ))}
        <article className="parameter-card parameter-card--reference">
          <span><Gauge size={18} /></span>
          <div><small>Reference speed</small><strong>{formatNumber(latest?.reference_speed)}</strong><em>km/h</em></div>
        </article>
      </div>
      <div className="stat-grid stat-grid--coach">
        <StatCard label="Connection" value={latest?.online ? 'Online' : 'Offline'} meta={formatRelative(latest?.sample_ts)} icon={<RadioTower size={18} />} tone={latest?.online ? 'green' : 'red'} />
        <StatCard label="Operating state" value={latest?.status ?? 'No data'} meta="Derived from speed and CED health" icon={<TrainFront size={18} />} tone={latest?.active ? 'teal' : 'amber'} />
        <StatCard label="Active alerts" value={activeAlerts} meta="Open coach events" icon={<ShieldAlert size={18} />} tone={activeAlerts ? 'red' : 'green'} />
      </div>
      <Panel title="Latest sample" description="Current telemetry state" icon={<Activity size={18} />}>
        {latest ? (
          <dl className="detail-grid">
            <div><dt>Sample time</dt><dd>{formatDateTime(latest.sample_ts)}</dd></div>
            <div><dt>Latitude</dt><dd>{formatNumber(latest.gps_lat, 6)}</dd></div>
            <div><dt>Longitude</dt><dd>{formatNumber(latest.gps_lon, 6)}</dd></div>
            <div><dt>Altitude</dt><dd>{formatNumber(latest.gps_alt)} m</dd></div>
          </dl>
        ) : <EmptyState title="No latest sample" description="This coach has not received parsed telemetry yet." />}
      </Panel>
    </div>
  );
}

function TrendsTab({
  samples,
  hours,
  setHours
}: {
  samples: TelemetrySample[];
  hours: number;
  setHours: (hours: number) => void;
}) {
  return (
    <Panel
      title="Linear speed trend"
      description={`${samples.length} samples in the selected window`}
      icon={<Activity size={18} />}
      actions={<select className="compact-select" value={hours} onChange={(event) => setHours(Number(event.target.value))}><option value={1}>Last hour</option><option value={6}>Last 6 hours</option><option value={24}>Last 24 hours</option><option value={72}>Last 3 days</option><option value={168}>Last 7 days</option></select>}
    >
      {samples.length ? <TelemetryChart samples={samples} /> : <EmptyState title="No trend data" description="Telemetry samples for this period will appear as a live speed chart." />}
    </Panel>
  );
}

function ValvesTab({ valveState }: { valveState: CoachPayload['valveState'] }) {
  const states = valveState?.valve_states_json ?? {};
  return (
    <div className="tab-stack">
      <div className="valve-grid">
        {[1, 2, 3, 4].map((axle) => (
          <article className="valve-card" key={axle}>
            <header><span><Waves size={18} /></span><div><strong>Axle {axle}</strong><small>{formatNumber(valveState?.axle_speeds_json?.[axle - 1])} km/h</small></div></header>
            <div><span>HOLD {axle}</span><StatusLamp value={states[`hold_${axle}`]} /></div>
            <div><span>VENT {axle}</span><StatusLamp value={states[`vent_${axle}`]} /></div>
          </article>
        ))}
      </div>
      <Panel title="Valve sample status" description="Latest hold and vent output state" icon={<Waves size={18} />}>
        {valveState ? <div className="sample-banner"><StatusBadge>{valveState.status}</StatusBadge><span>Captured {formatDateTime(valveState.sample_ts)}</span></div> : <EmptyState title="No valve sample" description="Valve output state is not available for this coach." />}
      </Panel>
    </div>
  );
}

function StatusLamp({ value }: { value: boolean | null | undefined }) {
  return <span className={`status-lamp ${value === true ? 'is-on' : value === false ? 'is-off' : 'is-unknown'}`}>{value === true ? 'ON' : value === false ? 'OFF' : '—'}</span>;
}

function AlertsTab({
  alerts,
  emptyTitle,
  emptyDescription
}: {
  alerts: Alert[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <Panel title={emptyTitle === 'No active alerts' ? 'Active alerts' : 'Historical alerts'} description={`${alerts.length} events`} icon={<ShieldAlert size={18} />}>
      {alerts.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Alert</th><th>Severity</th><th>Started</th><th>Ended</th><th>Duration</th><th>Status</th></tr></thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.id}>
                  <td><div className="table-identity"><span className="table-identity__icon table-identity__icon--alert"><ShieldAlert size={17} /></span><div><strong>{alert.alert_name}</strong><span>{alert.alert_key.slice(0, 8)}</span></div></div></td>
                  <td><StatusBadge>{alert.severity}</StatusBadge></td>
                  <td>{formatDateTime(alert.start_time)}</td>
                  <td>{formatDateTime(alert.end_time)}</td>
                  <td>{formatDuration(alert.duration_ms)}</td>
                  <td><StatusBadge>{alert.status}</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title={emptyTitle} description={emptyDescription} />}
    </Panel>
  );
}

function ShellingTab({
  shelling,
  date,
  setDate
}: {
  shelling: ShellingIndex[];
  date: string;
  setDate: (value: string) => void;
}) {
  const coachScope = shelling.find((item) => item.scope === 'coach');
  const axleRows = shelling.filter((item) => item.scope === 'axle');
  return (
    <div className="tab-stack">
      <Panel
        title="Daily shelling index"
        description="Shelling duration as a percentage of running duration."
        icon={<Gauge size={18} />}
        actions={<label className="date-control"><CalendarDays size={15} /><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>}
      >
        {shelling.length ? (
          <>
            <div className="shelling-hero">
              <div><span>Coach shelling index</span><strong>{formatNumber(coachScope?.coach_shelling_index_pct, 2)}%</strong></div>
              <div><span>Running duration</span><strong>{formatDuration(coachScope?.coach_running_duration_ms)}</strong></div>
              <div><span>Shelling duration</span><strong>{formatDuration(coachScope?.coach_shelling_duration_ms)}</strong></div>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>Axle</th><th>Running duration</th><th>Shelling duration</th><th>Shelling index</th></tr></thead>
                <tbody>
                  {axleRows.map((item) => (
                    <tr key={item.id}><td><strong>Axle {item.axle_no}</strong></td><td>{formatDuration(item.axle_running_duration_ms)}</td><td>{formatDuration(item.axle_shelling_duration_ms)}</td><td className="metric-cell">{formatNumber(item.axle_shelling_index_pct, 2)}%</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : <EmptyState title="No shelling index" description="The analytics worker has not computed an index for this date." />}
      </Panel>
    </div>
  );
}

function LocationTab({
  coach,
  latest,
  points,
  hours,
  setHours
}: {
  coach: Coach;
  latest: TelemetryLatest | null;
  points: LocationPoint[];
  hours: number;
  setHours: (hours: number) => void;
}) {
  const mapPoints = useMemo<MapPoint[]>(() => points.map((point, index) => ({
    id: `${coach.id}-${index}`,
    coach_id: coach.id,
    coach_no: coach.coach_no,
    coach_name: coach.coach_name,
    status: latest?.status ?? coach.latest_status ?? null,
    online: latest?.online ?? false,
    active: latest?.active ?? false,
    off: latest?.off ?? true,
    gps_lon: point.gps_lon,
    gps_lat: point.gps_lat,
    gps_alt: point.gps_alt,
    sample_ts: point.sample_ts,
    reference_speed: point.reference_speed
  })), [coach, latest, points]);

  return (
    <Panel
      title="Location history"
      description={`${points.length} GPS samples`}
      icon={<MapPinned size={18} />}
      actions={<select className="compact-select" value={hours} onChange={(event) => setHours(Number(event.target.value))}><option value={1}>Last hour</option><option value={6}>Last 6 hours</option><option value={24}>Last 24 hours</option><option value={72}>Last 3 days</option><option value={168}>Last 7 days</option></select>}
    >
      <FleetMap points={mapPoints} height={470} />
      {points.length > 0 && <div className="location-strip">{points.slice(-5).reverse().map((point) => <div key={point.sample_ts}><MapPinned size={14} /><span>{formatNumber(point.gps_lat, 4)}, {formatNumber(point.gps_lon, 4)}</span><small>{formatDateTime(point.sample_ts)} · {formatNumber(point.reference_speed)} km/h</small></div>)}</div>}
    </Panel>
  );
}
