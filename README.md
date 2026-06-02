# NER Annotation Tool

A Next.js app for span-level NER annotation.

## Owner configuration

Accounts are stored as PBKDF2 password hashes in `src/config/accounts.json`.
Manage them from the repository root:

```bash
python scripts/manage_accounts.py list
python scripts/manage_accounts.py add annotator3
python scripts/manage_accounts.py remove annotator3
```

Labels are stored in `src/config/labels.json`.
Manage them from the repository root:

```bash
python scripts/manage_labels.py list
python scripts/manage_labels.py add "Medication"
python scripts/manage_labels.py remove "Medication"
```

Rebuild and redeploy after changing accounts or labels:

```bash
npm run build
```

This app is statically exported, so client-side login is a workflow gate, not server-side access control.

## Development

```bash
npm install
npm run dev
```
