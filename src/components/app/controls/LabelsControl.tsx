"use client";

import type { ControlTag } from '@/types';
import { cn } from '@/lib/utils';
import { useAnnotator } from './context';

export function LabelsControl({ control }: { control: ControlTag }) {
  const { armed, setArmed } = useAnnotator();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {control.options.map((opt) => {
        const isArmed = armed?.control === control.name && armed.value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() =>
              setArmed(isArmed ? null : { control: control.name, value: opt.value })
            }
            className={cn(
              'text-sm rounded-md border px-2 py-1 transition-all',
              isArmed ? 'ring-2 ring-offset-1' : 'hover:opacity-80',
            )}
            style={{
              backgroundColor: opt.color.bg,
              borderColor: opt.color.solid,
              color: opt.color.text,
              ...(isArmed ? { boxShadow: `0 0 0 2px ${opt.color.solid}` } : {}),
            }}
          >
            {opt.value}
          </button>
        );
      })}
      <span className="text-xs text-muted-foreground">
        {armed?.control === control.name
          ? 'Select text to apply this label'
          : 'Click a label, then select text'}
      </span>
    </div>
  );
}
