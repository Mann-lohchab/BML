# BML Rail Operations

Full-stack railway telemetry and shelling analytics platform. The backend follows the
Shelling Analytical Tool blueprint in `sat-express-postgres-blueprint.md`; the frontend
is a React application powered by React Router v7.

## What is included

- Express API with JWT auth and role checks
- PostgreSQL schema and migration runner
- MQTT ingestion worker
- telemetry normalization and shelling flag computation
- latest-state and overview endpoints
- contacts, triggers, notifications, reports, and admin CRUD endpoints
- CSV and PDF report artifact generation
- Native C UDP reader for the WSPD-side packet format from the PDF
- BML operations frontend with overview, maps, coach analytics, contacts, triggers,
  notifications, reports, and CED administration

## Local setup

1. Start infrastructure:

```bash
docker compose up -d
```

2. Install dependencies:

```bash
bun install
```

3. Copy environment values:

```bash
cp .env.example .env
```

4. Apply database migrations:

```bash
npm run migrate
```

5. Bootstrap the initial admin user:

```bash
npm run bootstrap
```

The example environment creates the dashboard demo account:

```text
ID: admin@bml.local
Password: bmladmin123
```

The login screen can fill these credentials automatically. Change both bootstrap values
before using BML outside a local demonstration environment.

6. Start the API:

```bash
npm run dev
```

7. Start the frontend in a second terminal:

```bash
npm run dev:web
```

Open `http://localhost:5173`. Vite proxies `/api` requests to the API on port `3000`.
All application API routes are namespaced under `/api`; `/healthz` and `/api/healthz`
are both available for health checks.

## Frontend

The frontend lives in `web/` and uses React Router v7 in data-router mode. Available
screens cover every API surface currently exposed by BML:

- secure login and account recovery request
- fleet summary, live coach map, activity, and trigger status
- coach registry and detailed parameters, trends, valve states, alerts, shelling index,
  and GPS history
- CED device administration
- contacts and notification read state
- trigger creation, editing, enable/disable, and deletion
- report requests, status, detail, and authenticated artifact downloads

For a production build:

```bash
npm run build:all
NODE_ENV=production npm start
```

The Express server serves the compiled SPA from `dist-web` in production. Set
`VITE_API_BASE_URL` at build time only when the API is hosted on a different origin.

## Background workers

Run the workers in separate terminals if you want live ingestion and processing:

```bash
npm run worker:ingestion
npm run worker:analytics
npm run worker:notifications
npm run worker:reports
```

## Native UDP Reader

The machine-side UDP reader is in [native/wsps_udp_reader.c](/home/user/BML/native/wsps_udp_reader.c) with a small CLI in [native/wsps_udp_main.c](/home/user/BML/native/wsps_udp_main.c). It follows the PDF's WSPD UDP string layout:

- 8-byte `Faiveley` header
- 4-byte big-endian UTC timestamp in seconds
- 4 axle speeds and 1 reference speed as `uint16`, unit `0.1 km/h`
- 48 bits of hold/vent, alarm, and status flags
- 4-byte trailing CRC field

Build and run it with:

```bash
cd native
make
./wsps_udp_listener -p 5000
```

The listener expects a 64-hex-character UDP payload, for example the `UDP STRING` shown in the manual.

## Notes

- The exact WSPD decryption algorithm from the PDF is still a configuration point. The code supports `none`, `base64`, and `aes-256-gcm`.
- Packet parsing is intentionally tolerant: JSON, key-value, and simple pipe-delimited payloads are accepted so the system is usable before the final device decoder is confirmed.
- Ingestion auto-creates coach and CED master records on first packet so a blank fleet can start receiving telemetry immediately.
- The report worker writes artifacts under `SAT_REPORT_DIR`.
