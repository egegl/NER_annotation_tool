"use client";

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Columns detected in the imported file. */
  columns: string[];
  /** First non-empty value per column, shown as a preview. */
  samples: Record<string, string>;
  /** Pre-selected column (best guess). */
  defaultColumn?: string;
  fileName: string;
  /** Called with the chosen column when the admin confirms. */
  onConfirm: (textColumn: string) => void;
}

const truncate = (value: string, max = 140) =>
  value.length > max ? `${value.slice(0, max)}…` : value;

export function SelectTextColumnDialog({
  open,
  onOpenChange,
  columns,
  samples,
  defaultColumn,
  fileName,
  onConfirm,
}: Props) {
  const [selected, setSelected] = useState<string>(defaultColumn ?? columns[0] ?? '');

  // Reset the choice each time a new file is opened for selection.
  useEffect(() => {
    if (open) setSelected(defaultColumn ?? columns[0] ?? '');
  }, [open, defaultColumn, columns]);

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
          className="max-h-[360px] overflow-auto pr-1"
        >
          {columns.map((col) => (
            <label
              key={col}
              htmlFor={`col-${col}`}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors',
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!selected}
            onClick={() => {
              onConfirm(selected);
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
