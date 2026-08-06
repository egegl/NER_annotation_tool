# BMI Annotation Tool — Admin Cheat Sheet

Login by email; admins create every account. All data sits in `/labs/bozkurtlab/annotation-tool/data/annotation.db`.

## Order of operations

1. Sign in
2. **Access Settings** — create annotator accounts
3. **Labeling Setup** — define labels and questions
4. **Upload Project** — file + text column
5. **Assign dialog** — tick who works on it
6. **Reviewer Mode** — adjudicate conflicts
7. **Export** — download

Accounts and config must exist before the upload.

## Config (XML)

`<Text value="$text">` · `<Labels>` spans · `<Choices>` pick-one/many · `<TextArea>` · `<Rating>` · `<Relations>` · `<Header>` · `<View>`

- `toName` points at the `<Text>` name · `required="true"` gates the annotated count · `perRegion="true"` asks per span.
- Five templates: Classification, NER, Relation Extraction, Aspect-Based Sentiment, Summarization.
- LLM-generated Label Studio XML works 1:1. Save is greyed out while the config is invalid.

## Upload

- Accepts `.csv` `.xlsx` `.xls` and Label Studio `.json`; annotations already in the file are stripped.
- Pick the text column (becomes `$text`) and an ID column, or auto-number `case-1, case-2, …`.
- Optional keyword file: one term per line, underlined in every note for everyone.
- Ticked accounts move to the new file; unticked ones keep their current project.

## Annotating

- Select text → label picker, or click a label first, then select.
- Regions card: click a span to select, trash to delete, link icon for relations.
- Autosaves — there is no Save button.
- Ctrl/Cmd-F search · T reading size · pen keyword list.
- `Annotated x / N` counts only cases where every `required` control is answered.

## Reviewer Mode

- Pick the project; blind adjudication is on by default and saved per project.
- Blue = annotator 1, yellow = annotator 2, green = overlap; Conflict / Agreed shown per question.
- Accept Annotator N, Accept all from Annotator N, Clear, or answer it yourself.
- Agreement % = matched cases ÷ cases at least two people annotated.

## Export

Pick project → tick annotators → optional ground truth → `annotated_<file>.json` / `.csv`.

- **JSON**: one object per case, `data` + `annotations[]` tagged `completed_by`; 1:1 with Label Studio.
- **CSV**: one row per case per annotator — `ID, text, annotator, <your columns>, annotations`.
