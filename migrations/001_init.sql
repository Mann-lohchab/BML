CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_no text NOT NULL UNIQUE,
  coach_name text NOT NULL,
  line_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ced_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ced_no text NOT NULL UNIQUE,
  serial_no text,
  firmware_version text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coach_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coach_group_members (
  coach_group_id uuid NOT NULL REFERENCES coach_groups(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_group_id, coach_id)
);

CREATE TABLE IF NOT EXISTS device_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  ced_device_id uuid NOT NULL REFERENCES ced_devices(id) ON DELETE CASCADE,
  assigned_from timestamptz NOT NULL DEFAULT now(),
  assigned_to timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS device_assignments_active_unique
  ON device_assignments (coach_id)
  WHERE is_active;

CREATE UNIQUE INDEX IF NOT EXISTS device_assignments_device_active_unique
  ON device_assignments (ced_device_id)
  WHERE is_active;

CREATE TABLE IF NOT EXISTS device_connectivity_status (
  ced_device_id uuid PRIMARY KEY REFERENCES ced_devices(id) ON DELETE CASCADE,
  coach_id uuid REFERENCES coaches(id) ON DELETE SET NULL,
  status text NOT NULL,
  last_seen_at timestamptz,
  last_packet_id uuid,
  last_error_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS raw_mqtt_packets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  topic text NOT NULL,
  coach_no text,
  ced_no text,
  packet_ts_ms bigint,
  gps_lon numeric(12, 8),
  gps_lat numeric(12, 8),
  gps_alt numeric(12, 3),
  encrypted_wspd_data text,
  error_code_hex text,
  end_bit text,
  payload_hash text NOT NULL UNIQUE,
  raw_payload jsonb NOT NULL,
  parse_status text NOT NULL DEFAULT 'pending',
  parse_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS raw_mqtt_packets_received_at_idx ON raw_mqtt_packets (received_at DESC);
CREATE INDEX IF NOT EXISTS raw_mqtt_packets_coach_no_idx ON raw_mqtt_packets (coach_no);
CREATE INDEX IF NOT EXISTS raw_mqtt_packets_ced_no_idx ON raw_mqtt_packets (ced_no);

CREATE TABLE IF NOT EXISTS telemetry_dedup_keys (
  dedup_key text PRIMARY KEY,
  raw_packet_id uuid REFERENCES raw_mqtt_packets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telemetry_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id uuid REFERENCES raw_mqtt_packets(id) ON DELETE SET NULL,
  coach_id uuid REFERENCES coaches(id) ON DELETE SET NULL,
  ced_device_id uuid REFERENCES ced_devices(id) ON DELETE SET NULL,
  sample_ts timestamptz NOT NULL,
  gps_lon numeric(12, 8),
  gps_lat numeric(12, 8),
  gps_alt numeric(12, 3),
  speed_axle_1 numeric(10, 3),
  speed_axle_2 numeric(10, 3),
  speed_axle_3 numeric(10, 3),
  speed_axle_4 numeric(10, 3),
  reference_speed numeric(10, 3),
  hold_1 boolean,
  vent_1 boolean,
  hold_2 boolean,
  vent_2 boolean,
  hold_3 boolean,
  vent_3 boolean,
  hold_4 boolean,
  vent_4 boolean,
  fault_bits_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status_bits_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ced_udp_error boolean NOT NULL DEFAULT false,
  ced_gps_unlock boolean NOT NULL DEFAULT false,
  ced_memory_overflow boolean NOT NULL DEFAULT false,
  ced_network_error boolean NOT NULL DEFAULT false,
  raw_decrypted_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telemetry_samples_sample_ts_idx ON telemetry_samples (sample_ts DESC);
CREATE INDEX IF NOT EXISTS telemetry_samples_coach_id_idx ON telemetry_samples (coach_id);
CREATE INDEX IF NOT EXISTS telemetry_samples_ced_device_id_idx ON telemetry_samples (ced_device_id);

CREATE TABLE IF NOT EXISTS telemetry_latest (
  coach_id uuid PRIMARY KEY REFERENCES coaches(id) ON DELETE CASCADE,
  ced_device_id uuid REFERENCES ced_devices(id) ON DELETE SET NULL,
  sample_id uuid REFERENCES telemetry_samples(id) ON DELETE SET NULL,
  sample_ts timestamptz NOT NULL,
  reference_speed numeric(10, 3),
  axle_speeds_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  valve_states_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL,
  online boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT false,
  off boolean NOT NULL DEFAULT false,
  gps_lon numeric(12, 8),
  gps_lat numeric(12, 8),
  gps_alt numeric(12, 3),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shelling_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  ced_device_id uuid REFERENCES ced_devices(id) ON DELETE SET NULL,
  sample_ts timestamptz NOT NULL,
  axle_no smallint NOT NULL,
  is_shelling boolean NOT NULL,
  reason_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  reference_speed numeric(10, 3),
  axle_speed numeric(10, 3),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shelling_flags_sample_ts_idx ON shelling_flags (sample_ts DESC);
CREATE INDEX IF NOT EXISTS shelling_flags_coach_id_idx ON shelling_flags (coach_id);

CREATE TABLE IF NOT EXISTS daily_shelling_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  index_date date NOT NULL,
  axle_no smallint,
  scope text NOT NULL DEFAULT 'axle',
  axle_running_duration_ms bigint NOT NULL DEFAULT 0,
  axle_shelling_duration_ms bigint NOT NULL DEFAULT 0,
  axle_shelling_index_pct numeric(10, 4),
  coach_running_duration_ms bigint NOT NULL DEFAULT 0,
  coach_shelling_duration_ms bigint NOT NULL DEFAULT 0,
  coach_shelling_index_pct numeric(10, 4),
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_id, index_date, scope, axle_no)
);

CREATE TABLE IF NOT EXISTS alert_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid REFERENCES coaches(id) ON DELETE CASCADE,
  alert_key text NOT NULL UNIQUE,
  alert_name text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  is_active boolean NOT NULL DEFAULT true,
  condition_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key text NOT NULL,
  alert_name text NOT NULL,
  severity text NOT NULL,
  coach_id uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  ced_device_id uuid REFERENCES ced_devices(id) ON DELETE SET NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  status text NOT NULL,
  duration_ms bigint,
  source_sample_ts timestamptz,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alert_events_status_idx ON alert_events (status);
CREATE INDEX IF NOT EXISTS alert_events_coach_id_idx ON alert_events (coach_id);
CREATE INDEX IF NOT EXISTS alert_events_start_time_idx ON alert_events (start_time DESC);

CREATE TABLE IF NOT EXISTS alert_event_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_event_id uuid NOT NULL REFERENCES alert_events(id) ON DELETE CASCADE,
  state text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  note text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  preferred_channel text NOT NULL DEFAULT 'email',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trigger_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  metric text NOT NULL,
  operator text NOT NULL,
  threshold numeric(12, 3),
  duration_ms bigint,
  severity text NOT NULL DEFAULT 'medium',
  is_active boolean NOT NULL DEFAULT true,
  condition_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trigger_rule_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_rule_id uuid NOT NULL REFERENCES trigger_rules(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trigger_rule_id, contact_id, channel)
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  channel text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  quiet_hours_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  alert_event_id uuid REFERENCES alert_events(id) ON DELETE CASCADE,
  channel text NOT NULL,
  subject text,
  body text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'queued',
  provider_message_id text,
  provider_response_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_delivery_status_idx ON notifications (delivery_status);

CREATE TABLE IF NOT EXISTS report_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  report_type text NOT NULL,
  filter_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_request_id uuid NOT NULL REFERENCES report_requests(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_request_id uuid NOT NULL REFERENCES report_requests(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  storage_path text NOT NULL,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO roles (code, name)
VALUES
  ('admin', 'Administrator'),
  ('operator', 'Operator'),
  ('viewer', 'Viewer')
ON CONFLICT (code) DO NOTHING;
