"use client";

import type { ControlTag } from '@/types';
import { cn } from '@/lib/utils';
import { useAnnotator } from './context';

export function RelationsControl({ control }: { control: ControlTag }) {
  const { armedRelation, setArmedRelation } = useAnnotator();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">Relations:</span>
      {control.options.length === 0 && (
        <span className="text-xs text-muted-foreground">(unlabeled)</span>
      )}
      {control.options.map((opt) => {
        const active = armedRelation === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setArmedRelation(active ? null : opt.value)}
            className={cn(
              'text-sm rounded-md border px-2 py-1',
              active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted',
            )}
          >
            {opt.value}
          </button>
        );
      })}
      <span className="text-xs text-muted-foreground">
        Select a region below → “Link from here” → click another region.
      </span>
    </div>
  );
}
