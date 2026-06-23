# Demo data

Sample files for trying out the BMI Annotation Tool end to end. All data here is
**synthetic and de-identified** — fictional patients, providers, clinics, and
cities. Nothing is real PHI.

## Files

| File | Purpose |
| --- | --- |
| `clinical_notes.csv` | 15 fictional pain-management clinical notes to annotate. |
| `cannabis_terms.txt` | A cannabis keyword list for the **Always-highlight keywords** feature. |

### `clinical_notes.csv`

Columns: `note_id`, `encounter_date`, `department`, `clinical_note`.

On import the tool auto-detects **`note_id`** as the ID column and
**`clinical_note`** as the text to annotate (it's the longest column). The notes
deliberately contain `Person` / `Organization` / `Location` entities, so they
work out of the box with the default NER labeling config (Person / Organization /
Location) as well as any cannabis-focused setup you configure.

### `cannabis_terms.txt`

One keyword per line (the format the keyword-file picker expects — every
non-blank line is treated as a term; no comments). 46 cannabis-related terms
spanning plant/common names, clinical phrases, abbreviations (MMJ, THC, CBD),
cannabinoid chemistry, prescription cannabinoids (dronabinol, nabilone,
nabiximols), brand names (Marinol, Cesamet, Epidiolex, Sativex), and product /
route forms. Matching is case-insensitive, and longer phrases win over shorter
ones (so "medical marijuana" highlights as one span, not two).

The terms were chosen to avoid false positives in clinical prose — e.g. ambiguous
slang like "joint", "pot", or "blunt" is intentionally excluded so "joint pain"
or "potassium" isn't highlighted. Every term here appears in the demo notes
(122 highlights across the 15 notes).

## How to use

1. Log in as an admin.
2. **(Optional)** Open **Labeling Setup** to review/adjust the labeling config.
3. Click **Upload Project** and choose `clinical_notes.csv`.
4. In the column dialog, confirm the text column (`clinical_note`) and ID column
   (`note_id`), then attach `cannabis_terms.txt` under **Always-highlight
   keywords**.
5. Upload. Every annotator now sees the cannabis terms underlined in every note,
   on top of any personal keywords they add via the highlighter button
   ("Keyword highlights") in the note toolbar.
