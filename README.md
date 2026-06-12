# BMI Annotation Tool

A collaborative, Label Studio-style text annotation app (Next.js). An admin
uploads **one shared project** (a data file + an XML labeling interface) and every
logged-in user — including external collaborators reaching the app through a
shared link — annotates **their own private copy** of that same project. Users
never see each other's annotations; the admin exports any selection of them.

## Architecture

The app runs as a **Node server** (`next start`) backed by a single **SQLite**
file. This replaces the previous static-export build, which could not share a
project across browsers/machines. State lives in the database, not the browser:

- `project` / `tasks` — the single uploaded project and its unannotated rows.
- `annotations` — each user's private results, keyed by `(task, user)`.
- `users` / `sessions` — accounts and httpOnly cookie sessions (real server-side
  access control, not just a workflow gate).

The database file is `DATA_DIR/annotation.db` (default `./data/annotation.db`).
Back it up by copying that file.

## User flow

1. **Admin logs in** (seeded account, see below).
2. **Admin uploads a project**: sets the labeling XML (**Labeling Setup**) and
   imports a `.csv`/`.xlsx`/`.json` file (**Upload Project**). Any annotations in
   the file are stripped so everyone starts clean.
3. **Admin creates annotator accounts** (**Create Account**) and shares the app
   URL + credentials.
4. **Collaborators log in** and land directly on the shared project: the same
   unannotated tasks and the same interface. They have no import/admin controls.
5. **They annotate.** Each change auto-saves to the server, private to them.
6. **Admin exports** (**Export**): a dialog lists every account with checkboxes —
   include/exclude whoever you want — then downloads a combined Label Studio JSON
   (each task carries one `annotations` entry per selected user, tagged with
   `completed_by`) or a CSV (one row per task and annotator).

> Re-uploading a project **replaces** it and permanently deletes every
> annotator's work (the admin is warned first).

## Labeling configuration

The annotation UI is defined by a **Label Studio-style XML labeling config**,
edited by admins in the **Labeling Setup** dialog (XML editor + task-type
templates + live preview + validation) and **shared with every annotator**.
Built-in templates cover:

- **Classification** (`<Choices>`)
- **Named Entity Recognition** (`<Labels>`)
- **Relation Extraction** (`<Labels>` + `<Relations>`)
- **Aspect-Based Sentiment** (`<Labels>` aspects + `<Choices perRegion>`)
- **Summarization** (`<TextArea>`)

Supported tags: object `<Text value="$field">`; controls `<Labels>/<Label>`,
`<Choices>/<Choice>`, `<TextArea>`, `<Rating>`, `<Relations>/<Relation>`
(linked to objects via `toName`, with optional `perRegion="true"`); layout
`<View>` and `<Header>`. The project default config lives in
`src/config/labeling.json`.

Imports accept `.csv`/`.xlsx` (a `text` or `raw_text` column) or a Label Studio
`.json` export; exports round-trip back through import.

## Accounts

There are two tiers: **annotator** (default) and **admin**. There is no public
sign-up — admins provision accounts. Two ways to create them:

- **Seed script** (bootstrap the first admin):

  ```bash
  node scripts/seed_db.mjs --email you@example.com --password 'secret' --role admin
  ```

  The script also imports any accounts from `src/config/accounts.json` (existing
  PBKDF2 hashes are preserved), so prior accounts keep working.

- **In-app**, after an admin logs in — the **Create Account** button (with a tier
  selector). These are written to the database and work from anywhere the
  instance is reachable.

Everyone logs in by email.

## Development

```bash
npm install
node scripts/seed_db.mjs --email you@example.com --password 'secret' --role admin
npm run dev
```

## Deployment (self-hosted)

```bash
npm install
npm run build
node scripts/seed_db.mjs --email you@example.com --password 'secret' --role admin
npm run start   # next start; put nginx in front for TLS / a public URL
```

### Deployment requirements & gotchas

- **Runs as a Node process** (`next start`), not static files — the host must
  allow a long-lived process listening on a port.
- **Single instance only.** SQLite is single-writer; do **not** run multiple
  replicas / PM2 cluster mode against the same database file.
- **`DATA_DIR`** must point at a writable, **persistent** directory (not scratch
  space that's wiped between jobs). Back up by copying `annotation.db`.
- **HTTPS vs HTTP — important.** The login cookie is `Secure` (HTTPS-only) by
  default. If the instance is served over plain `http://` (e.g. an internal
  cluster URL with no TLS), login will silently fail — set `INSECURE_COOKIES=true`
  for that case. Prefer real HTTPS (nginx in front) when possible.
- **Native module:** `better-sqlite3` is compiled; build on the cluster, or run
  `npm rebuild better-sqlite3` after copying the project between machines.
- **nginx body size:** project uploads POST the whole file as JSON — raise
  `client_max_body_size` (e.g. `50m`) so large datasets aren't rejected.
- **Subpath:** the app expects to live at a domain root or subdomain. Serving it
  under a path prefix (e.g. `/lab/annotate`) needs extra work and is not
  supported out of the box.
