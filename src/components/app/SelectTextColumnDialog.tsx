"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseTerms } from '@/lib/highlight';

/** Sentinel for "no ID column — auto-number each row" in the ID <Select>.
 * Radix Select disallows empty-string item values, so we map it to '' on use. */
const NO_ID = '__none__';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Columns detected in the imported file. */
  columns: string[];
  /** First non-empty value per column, shown as a preview. */
  samples: Record<string, string>;
  /** Pre-selected text column (best guess). */
  defaultColumn?: string;
  /** Pre-selected ID column (best guess); '' or undefined means auto-number. */
  defaultIdColumn?: string;
  fileName: string;
  /** Called with the chosen columns when the admin confirms. `idColumn` is the
   * empty string when the admin opts to auto-number instead of using a column.
   * `keywords` is the raw contents of the optional always-highlight keyword file
   * (empty string when none was chosen). */
  onConfirm: (textColumn: string, idColumn: string, keywords: string) => void;
}

const truncate = (value: string, max = 140) =>
  value.length > max ? `${value.slice(0, max)}…` : value;

export function SelectTextColumnDialog({
  open,
  onOpenChange,
  columns,
  samples,
  defaultColumn,
  defaultIdColumn,
  fileName,
  onConfirm,
}: Props) {
  const [selected, setSelected] = useState<string>(defaultColumn ?? columns[0] ?? '');
  const [idColumn, setIdColumn] = useState<string>(defaultIdColumn || NO_ID);
  // Optional always-highlight keyword file: raw contents + the chosen file name.
  const [keywordsRaw, setKeywordsRaw] = useState('');
  const [keywordsFileName, setKeywordsFileName] = useState('');
  const keywordsInputRef = useRef<HTMLInputElement>(null);
  const keywordCount = useMemo(() => parseTerms(keywordsRaw).length, [keywordsRaw]);

  // Reset the choices each time a new file is opened for selection.
  useEffect(() => {
    if (open) {
      setSelected(defaultColumn ?? columns[0] ?? '');
      setIdColumn(defaultIdColumn || NO_ID);
      setKeywordsRaw('');
      setKeywordsFileName('');
    }
  }, [open, defaultColumn, defaultIdColumn, columns]);

  const handleKeywordsFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so the same file can be re-selected after a clear.
    if (keywordsInputRef.current) keywordsInputRef.current.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setKeywordsRaw(String(ev.target?.result ?? ''));
      setKeywordsFileName(file.name);
    };
    reader.readAsText(file);
  };

  const clearKeywords = () => {
    setKeywordsRaw('');
    setKeywordsFileName('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Which column is the main text?</DialogTitle>
          <DialogDescription>
            Choose the column from <strong>{fileName}</strong> that holds the text
            to annotate. Its content is shown to every annotator.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={selected}
          onValueChange={setSelected}
          className="max-h-[300px] overflow-y-auto pr-1"
        >
          {columns.map((col) => (
            <label
              key={col}
              htmlFor={`col-${col}`}
              className={cn(
                'flex min-w-0 cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors',
                selected === col ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
              )}
            >
              <RadioGroupItem id={`col-${col}`} value={col} className="mt-1" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{col}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {samples[col] ? truncate(samples[col]) : <em>(empty)</em>}
                </p>
              </div>
            </label>
          ))}
        </RadioGroup>

        <div className="space-y-2 border-t pt-4">
          <Label htmlFor="id-column">ID column</Label>
          <Select value={idColumn} onValueChange={setIdColumn}>
            <SelectTrigger id="id-column">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_ID}>None — auto-number each row</SelectItem>
              {/* Radix Select forbids empty-string item values; blank headers are
                  already dropped by columnsOf, but guard here too. */}
              {columns.filter((col) => col.trim() !== '').map((col) => (
                <SelectItem key={col} value={col}>
                  {col}
                  {samples[col] ? (
                    <span className="text-muted-foreground"> — {truncate(samples[col], 40)}</span>
                  ) : null}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Used as each case&apos;s ID in exports. Auto-numbered (case-1, case-2, …)
            when no column is chosen or its value is blank.
          </p>
        </div>

        <div className="space-y-2 border-t pt-4">
          <Label>
            Always-highlight keywords{' '}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <p className="text-xs text-muted-foreground">
            Upload a text file of keywords (one per line, or comma-separated). They&apos;re
            underlined in every note for every annotator, on top of each annotator&apos;s
            own keyword list.
          </p>
          <input
            type="file"
            ref={keywordsInputRef}
            onChange={handleKeywordsFile}
            className="hidden"
            accept=".txt,.csv,.tsv,text/plain"
            aria-label="Always-highlight keywords file"
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => keywordsInputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              {keywordsFileName ? 'Replace file' : 'Choose file'}
            </Button>
            {keywordsFileName ? (
              <>
                <span className="min-w-0 flex-1 truncate text-sm">{keywordsFileName}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={clearKeywords}
                  aria-label="Remove keywords file"
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">No file chosen</span>
            )}
          </div>
          {keywordsFileName ? (
            <p className="text-xs text-muted-foreground">
              {keywordCount} keyword{keywordCount === 1 ? '' : 's'} loaded
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!selected}
            onClick={() => {
              onConfirm(selected, idColumn === NO_ID ? '' : idColumn, keywordsRaw);
              onOpenChange(false);
            }}
          >
            Use this column
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
