export type User = {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
};

export type OverviewSummary = {
  coaches: number;
  online: number;
  offline: number;
  activeAlerts: number;
  queuedNotifications: number;
};

export type MapPoint = {
  id: string;
  coach_id?: string;
  coach_no: string;
  coach_name: string;
  status: string | null;
  online: boolean | null;
  active: boolean | null;
  off: boolean | null;
  gps_lon: string | number | null;
  gps_lat: string | number | null;
  gps_alt: string | number | null;
  sample_ts: string | null;
  reference_speed: string | number | null;
};

export type Coach = {
  id: string;
  coach_no: string;
  coach_name: string;
  line_name: string | null;
  is_active: boolean;
  latest_status?: string | null;
  latest_sample_ts?: string | null;
  reference_speed?: string | number | null;
  online?: boolean | null;
  active?: boolean | null;
  off?: boolean | null;
  gps_lon?: string | number | null;
  gps_lat?: string | number | null;
  gps_alt?: string | number | null;
  axle_speeds_json?: Array<number | string>;
  valve_states_json?: Record<string, boolean | null>;
};

export type TelemetryLatest = {
  coach_id: string;
  ced_device_id: string | null;
  sample_id: string | null;
  sample_ts: string;
  reference_speed: string | number | null;
  axle_speeds_json: Array<number | string>;
  valve_states_json: Record<string, boolean | null>;
  status: string;
  online: boolean;
  active: boolean;
  off: boolean;
  gps_lon: string | number | null;
  gps_lat: string | number | null;
  gps_alt: string | number | null;
};

export type TelemetrySample = {
  sample_ts: string;
  reference_speed: string | number | null;
  speed_axle_1: string | number | null;
  speed_axle_2: string | number | null;
  speed_axle_3: string | number | null;
  speed_axle_4: string | number | null;
  ced_udp_error: boolean;
  ced_gps_unlock: boolean;
};

export type LocationPoint = {
  sample_ts: string;
  gps_lon: string | number | null;
  gps_lat: string | number | null;
  gps_alt: string | number | null;
  reference_speed: string | number | null;
};

export type Alert = {
  id: string;
  alert_key: string;
  alert_name: string;
  severity: string;
  start_time: string;
  end_time: string | null;
  status: string;
  duration_ms: string | number | null;
  source_sample_ts: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
};

export type Trigger = {
  id: string;
  name: string;
  metric: string;
  operator: string;
  threshold: string | number | null;
  duration_ms: string | number | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  is_active: boolean;
  condition_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type Contact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  preferred_channel: 'email' | 'sms';
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Notification = {
  id: string;
  user_id: string | null;
  contact_id: string | null;
  alert_event_id: string | null;
  channel: string;
  subject: string | null;
  body: string;
  delivery_status: string;
  provider_message_id: string | null;
  read_at: string | null;
  sent_at: string | null;
  created_at: string;
};

export type Report = {
  id: string;
  requested_by: string | null;
  report_type: string;
  filter_json: Record<string, unknown>;
  status: string;
  requested_at: string;
  updated_at: string;
  file_name?: string | null;
  mime_type?: string | null;
  storage_path?: string | null;
};

export type Device = {
  id: string;
  ced_no: string;
  serial_no: string | null;
  firmware_version: string | null;
  is_active: boolean;
  status: string | null;
  last_seen_at: string | null;
  connectivity_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ShellingIndex = {
  id: string;
  coach_id: string;
  index_date: string;
  axle_no: number;
  scope: 'axle' | 'coach';
  axle_running_duration_ms: string | number;
  axle_shelling_duration_ms: string | number;
  axle_shelling_index_pct: string | number | null;
  coach_running_duration_ms: string | number;
  coach_shelling_duration_ms: string | number;
  coach_shelling_index_pct: string | number | null;
};
