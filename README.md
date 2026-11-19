# BMI Annotation Tool

A collaborative text annotation app (Next.js), similar to Label Studio. An admin
uploads projects (a data file + an XML labeling config each) and puts every
account on one of them; each user annotates their own private copy of that
project. Users don't see each other's work; the admin exports whichever
annotators they want.

## How it works

The app is a Node server (`next start`) backed by one SQLite file. State lives in
the database, not the browser. The main tables:

- `project` / `tasks`: the uploaded projects and their rows. `users.project_id`
  says which project an account is on.
- `annotations`: each user's results, keyed by `(task, user)`.
- `users` / `sessions`: accounts and httpOnly cookie sessions.

The database is at `DATA_DIR/annotation.db` (default `./data/annotation.db`).

## Usage

1. Admin logs in (see [Accounts](#accounts)).
2. Admin sets the labeling XML (**Labeling Setup**) and imports a
   `.csv`/`.xlsx`/`.json` file (**Upload Project**, later **Upload new
   project…** in the project menu). Existing annotations in the file are
   stripped.
3. Admin creates annotator accounts (**Access Settings** in the account menu)
   and shares the URL + credentials.
4. Annotators log in and land on the project they were assigned. They have no
   admin controls.
5. They annotate; each change auto-saves, private to them.
6. Admin exports (**Export**): pick accounts with checkboxes, optionally exclude
   the patient note column, then download a
   Label Studio JSON (one `annotations` entry per user, tagged `completed_by`) or
   a CSV (one row per task and annotator).

### Several projects

Uploading another file adds a project; it doesn't replace the old one. The
upload dialog asks which accounts move to it, and the rest stay where they are.

The top bar reads left to right as project, mode, actions, account:

- **Project menu** (left corner, admin only) names the open project and lists
  every project with its case and account counts. Picking one opens it for you,
  and Labeling Setup, Export and newly created accounts then default to it. In
  Review it switches the review to that project. The same menu has **Upload new
  project…** and **Manage projects…** (an Open button per row, and delete for
  projects no account is on).
- **Annotate | Review** switches between your own annotating and Reviewer Mode.
- **Labeling Setup** and **Export** act on the open project.
- **Account menu** (right corner) has **Access Settings**, which includes a
  project picker per account, so an annotator can be moved to any existing
  project without uploading anything.

Annotations are stored per case and per account, so moving to another project
never deletes work. Moving back brings the earlier annotations back. An
annotator sees one project at a time, the one an admin put them on.

## Labeling configuration

The UI is defined by a Label Studio-style XML config, edited by admins in
**Labeling Setup** (editor + templates + live preview + validation) and shared
with all annotators. Built-in templates: Classification (`<Choices>`), Document
Questions (several `<Choices>`), NER (`<Labels>`), Relation Extraction
(`<Labels>` + `<Relations>`), Aspect-Based Sentiment, and Summarization
(`<TextArea>`).

Supported tags: `<Text value="$field">`; `<Labels>`, `<Choices>`, `<TextArea>`,
`<Rating>`, `<Relations>` (linked via `toName`, optional `perRegion="true"`); and
`<View>` / `<Header>` for layout. The default config is in
`src/config/labeling.json`.

### Question mode

A config with three or more document-level questions (`<Choices>`, `<Rating>` or
`<TextArea>` without `perRegion`) is shown in question mode:

- On a wide screen (1280 px and up) the text stays pinned on the left and the
  questions sit beside it, so the annotator never scrolls away from the text.
  With several `<Text>` tags, the one the questions point to (`toName`) is shown
  in full and the others share the remaining height. A top-level `<View>` that
  holds both a text and a question keeps the config stacked.
- `<Text dialogue="true">` marks a conversation: each line that opens with
  `Name:` is a turn, with a gap above it and the name in that speaker's colour.
- Each question is one row. The `<Header>` right before a control is its title,
  and an optional `hint="..."` on that header is shown under the title in small
  print. "Hide hints" folds the hints away except on the active question.
- The active question is highlighted and takes key presses: `1` to `9` pick a
  choice by position (or set a rating), and a `<Choice hotkey="y">` adds its own
  key. A first answer moves on to the next open question. `↑` `↓` (or `k` `j`)
  move between questions, `Backspace` clears the answer, `←` `→` change the
  case, and `Enter` goes to the next unannotated case. Keys are ignored while
  typing in a field or with a dialog open.

Configs with fewer questions look and behave as before.

Imports take `.csv`/`.xlsx` or a Label Studio `.json` export. After parsing, the
admin is asked which column holds the main text to annotate (the choice is
mirrored into `$text`, which the config references); `text`/`raw_text` columns are
pre-selected automatically. Every parsed data row becomes a case, including a
row with a blank cell in the selected text column, so case numbers stay aligned
with the source file. Exports round-trip back through import.

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

This is a Node server, so it must run as a long-lived
process (`next start`). It cannot be served as static files.

### Behind a reverse proxy at a subpath

When the proxy serves the app under a path prefix (e.g.
`https://example.org/myapp/`), set `BASE_PATH` **at build time**. It's baked
into the build (both Next's `basePath` and the client-side
`NEXT_PUBLIC_BASE_PATH` used to prefix `fetch()` calls), and is also read at
runtime to scope the session cookie to that path:

```bash
export DATA_DIR=/srv/annotation-tool/data   # shared SQLite db (any path)
export BASE_PATH=/myapp                      # proxy path prefix
export NODE_ENV=production                   # enables Secure cookies
# Do NOT set INSECURE_COOKIES when TLS is terminated at the proxy.

npm run build
npm run start -- -H 0.0.0.0 -p 3000
```

The proxy then forwards `/myapp/` to the Node server **without stripping the
prefix** (e.g. nginx `location /myapp/ { proxy_pass http://127.0.0.1:3000; }`,
no trailing slash on `proxy_pass`). Only **one** server process may run against
a given `DATA_DIR` (see the note in `launch_annotator.sh`). Leave `BASE_PATH`
unset to serve at the domain root (the local terminal-launch workflow).

### Bozkurt Lab production (llm1)

The lab's instance runs on llm1 behind nginx at `/bmilabelapp/bozlabtool`. To
ship a change, push it to `main`, then on llm1 run:

```bash
cd /labs/bozkurtlab/annotation-tool/NER_annotation_tool
bash scripts/deploy_llm1.sh           # pull main, build, restart, verify
bash scripts/deploy_llm1.sh --check   # verify only
```

From a laptop, reach llm1 through the login node:
`ssh -t <user>@oddjobs.bmi.emory.edu ssh llm1`.

| | |
|---|---|
| Service | systemd user unit `annotation-tool` (`~/.config/systemd/user/annotation-tool.service`), `Restart=on-failure` |
| Listens on | `127.0.0.1:8001`, reached only through nginx |
| Code / data | `/labs/bozkurtlab/annotation-tool/NER_annotation_tool` on `main` / `/labs/bozkurtlab/annotation-tool/data` |
| Runtime | nvm Node 20, plus GCC 11 libraries from `/opt/modules/gcc/GCC1140/lib64` |
| Logs | `~/annotation-tool.log` |

Things that have broken it before:

- **Starting the server by hand** (`next start`, `nohup`, `launch_annotator.sh`).
  It misses the unit's environment, and it dies with your SSH session.
  `kill`ing the service's process stops it for good, because the unit restarts
  only on failure. Use `systemctl --user restart annotation-tool`.
- **Missing GCC 11 libraries.** better-sqlite3 needs `GLIBCXX_3.4.29`, which the
  system `libstdc++` lacks. Pages still load, but every login fails with "The
  server is busy", and `~/annotation-tool.log` shows `ERR_DLOPEN_FAILED`.
  `module load` doesn't work on llm1, so the library path is set directly.
- **Building without `BASE_PATH`.** Every page behind the proxy breaks.
- **Upload size.** The nginx in front is run by a separate account, so changing
  its `client_max_body_size` goes through that account's owner. Project uploads
  are sent in chunks of about 512 KB so they fit under nginx's 1 MB default.
