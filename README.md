# BMI Annotation Tool

A collaborative text annotation app (Next.js), similar to Label Studio. An admin
uploads one shared project (a data file + an XML labeling config), and every
logged-in user annotates their own private copy. Users don't see each other's
work; the admin exports whichever annotators they want.

## How it works

The app is a Node server (`next start`) backed by one SQLite file. State lives in
the database, not the browser. The main tables:

- `project` / `tasks`: the uploaded project and its rows.
- `annotations`: each user's results, keyed by `(task, user)`.
- `users` / `sessions`: accounts and httpOnly cookie sessions.

The database is at `DATA_DIR/annotation.db` (default `./data/annotation.db`). To
back it up, copy that file.

## Usage

1. Admin logs in (see [Accounts](#accounts)).
2. Admin sets the labeling XML (**Labeling Setup**) and imports a
   `.csv`/`.xlsx`/`.json` file (**Upload Project**). Existing annotations in the
   file are stripped.
3. Admin creates annotator accounts (**Create Account**) and shares the URL +
   credentials.
4. Annotators log in and land on the shared project. They have no admin controls.
5. They annotate; each change auto-saves, private to them.
6. Admin exports (**Export**): pick accounts with checkboxes, then download a
   Label Studio JSON (one `annotations` entry per user, tagged `completed_by`) or
   a CSV (one row per task and annotator).

Re-uploading a project replaces it and deletes everyone's work (you get a
warning first).

## Labeling configuration

The UI is defined by a Label Studio-style XML config, edited by admins in
**Labeling Setup** (editor + templates + live preview + validation) and shared
with all annotators. Built-in templates: Classification (`<Choices>`), NER
(`<Labels>`), Relation Extraction (`<Labels>` + `<Relations>`), Aspect-Based
Sentiment, and Summarization (`<TextArea>`).

Supported tags: `<Text value="$field">`; `<Labels>`, `<Choices>`, `<TextArea>`,
`<Rating>`, `<Relations>` (linked via `toName`, optional `perRegion="true"`); and
`<View>` / `<Header>` for layout. The default config is in
`src/config/labeling.json`.

Imports take `.csv`/`.xlsx` (a `text` or `raw_text` column) or a Label Studio
`.json` export. Exports round-trip back through import.

## Accounts

Two roles: `annotator` (default) and `admin`. There's no public sign-up, so
admins create accounts. Everyone logs in by email.

Create the first admin with the seed script:

```bash
node scripts/seed_db.mjs --email you@example.com --password 'secret' --role admin
```

The script also imports accounts from `src/config/accounts.json` (PBKDF2 hashes
are preserved). After that, admins can add accounts in-app with **Create
Account**.

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
npm run start   # put nginx in front for TLS / a public URL
```

Things to watch out for:

- **One instance only.** SQLite is single-writer, so don't run multiple replicas
  (or PM2 cluster mode) against the same database.
- **`DATA_DIR`** must be a writable, persistent directory, not scratch space
  that gets wiped.
- **HTTPS vs HTTP.** The login cookie is `Secure` (HTTPS-only) by default. Over
  plain `http://`, login silently fails, so set `INSECURE_COOKIES=true` in that
  case. Prefer real HTTPS.
- **Native module.** `better-sqlite3` is compiled; build on the target machine,
  or run `npm rebuild better-sqlite3` after copying the project.
- **nginx body size.** Uploads POST the whole file as JSON, so raise
  `client_max_body_size` (e.g. `50m`).
- **No subpath.** The app expects a domain root or subdomain, not a path prefix
  like `/lab/annotate`.
