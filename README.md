# University Innovation & Startup Incubation Center

A full-stack demonstration using **CockroachDB**, Node.js/Express, and a responsive browser interface. All dashboard figures, profiles, and reports are queried from CockroachDB; no browser-side sample data is substituted for database results.

## Run locally (Windows)

1. Install Node.js 20+ and download the experimental Windows CockroachDB executable from the [official releases](https://www.cockroachlabs.com/docs/releases/). Windows binaries are for development/demo use, **not production**.
2. Start a single-node development database in a separate terminal:
   ```bash
   cockroach start-single-node --insecure --listen-addr=127.0.0.1:26257 --http-addr=127.0.0.1:8080 --store=./cockroach-data
   ```
3. Create the database (once):
   ```bash
   cockroach sql --insecure --host=127.0.0.1:26257 -e 'CREATE DATABASE IF NOT EXISTS incubation;'
   ```
4. In this project directory:
   ```bash
   npm install
   npm start
   ```
5. Open **http://localhost:3000**. Schema migration and sample-data seeding happen on startup and are safe to rerun. For integration tests, first create a separate test database with `cockroach sql --insecure --host=127.0.0.1:26257 -e 'CREATE DATABASE IF NOT EXISTS incubation_test;'`, then run `npm test` while CockroachDB is running. Tests use `incubation_test` by default (or `TEST_DATABASE_URL`), not the app database.

For another instance, set `DATABASE_URL=postgresql://root@127.0.0.1:26257/incubation?sslmode=disable` (or a secure cluster URL). Set `PORT` to change the web port. The insecure mode above is strictly for localhost demonstration; use TLS, credentials, and application authorization for any deployment with real user data. Data lives in `cockroach-data` unless you change `--store`.

## Modules

- Startup portfolio: domain/stage filtering, search, startup profiles, and stage changes with audit history.
- People (student, faculty, alumni, industry), many-to-many founders and mentor assignments.
- Evaluations with 1–10 performance scores; investors, pitches, and investment rounds.
- Workshops/hackathons/training/demo days/networking and startup event participation.
- Patents, publications, innovation grants, and aggregate reports.
- Seed records are illustrative and use `.example` addresses.

## Data model / ER summary

`people 1—N founders N—1 startups`; `people 1—0..1 mentors`; `mentors N—N startups` through `mentor_assignments`; `startups 1—N stage_history / evaluations / investments / pitch_meetings / patents / publications / grants`; `investors 1—N investments / pitch_meetings`; `events N—N startups` through `event_attendance`. The full normalized schema (15 tables, primary/foreign keys, uniqueness, check constraints, and indexes) is in [`schema.sql`](schema.sql).

CockroachDB is distributed SQL with PostgreSQL-wire compatibility. Its relational constraints and transactional stage-history update suit this scenario better than vector, graph-only, or time-series storage: founders, investments, evaluations, and IP require referential integrity and joins, while an eventual multi-node deployment can scale without changing the SQL model. This local demonstration uses one node and does not claim to demonstrate multi-node resilience.

## API outline

`GET /api/health`, `/api/dashboard`, `/api/reports`, `/api/startups/:id`; `GET /api/{resource}` and `POST /api/{resource}` for startups, people, founders, mentors, mentor_assignments, evaluations, investors, pitch_meetings, investments, events, event_attendance, patents, publications, grants; `PATCH /api/startups/:id` for details/stage. SQL uses bound parameters; table and column names are limited to server-side allowlists. Invalid references, duplicate keys, invalid stages, and out-of-range evaluation scores are rejected. No authentication or deletion workflows are included in this classroom demo.
