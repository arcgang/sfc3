# WellnessHub

A wellness tracking platform that aggregates health data from wearable devices, surfaces insights, and helps users manage goals and alerts.

## Repository layout

```
apps/
  api/   — Node.js/Express backend (SQLite via better-sqlite3)
  web/   — React frontend (Vite)
```

## Starting the API

```bash
cd apps/api
npm install
cp .env.example .env   # edit values as needed
npm run dev            # starts on http://localhost:3000 (tsx watch)
```

## Starting the web app

```bash
cd apps/web
npm install
npm run dev            # starts on http://localhost:5173 (Vite)
```

---

## Seeding the Database

### Prerequisites

- Node.js 22 or later
- Dependencies installed in `apps/api`:

```bash
cd apps/api
npm install
```

### Environment variable

The seed script (and the API) use `DB_PATH` to locate the SQLite database file.

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PATH` | `./wellnesshub.db` | Path to the SQLite database file |

Copy `.env.example` to `.env` and adjust `DB_PATH` if you want the database written elsewhere:

```bash
cp apps/api/.env.example apps/api/.env
# Edit DB_PATH in apps/api/.env if needed, or leave the default
```

### Running the seed script

From the `apps/api` directory:

```bash
cd apps/api
npm run seed
```

The script runs all pending migrations first, then inserts demo data. A `Seed complete.` message is printed on success.

### What the script inserts

| Entity | Details |
|--------|---------|
| Demo user | `demo@wellnesshub.com` / password `Demo1234!`; plus six additional persona-mode users |
| Profiles | One profile per persona mode (`default`, `fitness`, `elder_friendly`, `chronic_care_aware`, `everyday_wellness`, `active_fitness`) |
| Device connections | Apple Watch Series 9 (connected) and Withings Body+ (disconnected) linked to the demo user |
| Health records | 14 days of vitals, activity (steps + active minutes), sleep, and body composition metrics |
| Goals | Four active goals covering steps, sleep, weight, and weekly active minutes |
| Goal insights | Two AI-generated recommendations tied to the goals above |
| Alerts | Four alerts across all categories (`stale_data`, `abnormal_reading`, `goal_risk`, `sync_failure`) |
| Insights | Five insights covering trend summaries, recommendations, and nudges |
| Engagement events | Seven events exercising every `event_type` value |
| Partner services | Eight partner service records (FitPro, NutriGuide, MindfulMe, SleepWell, Strength Builder, RunCoach, Wellness Coaching, Stress Relief) |
| Privacy requests | Two privacy requests (`export` completed, `delete` requested) |

### Idempotency

The script is safe to re-run. Every insert uses `INSERT OR IGNORE` with fixed UUIDs, so re-running it against a database that already contains seed data is a no-op — no duplicates are created.
