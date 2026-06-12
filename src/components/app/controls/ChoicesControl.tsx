"use client";

import type { ControlTag } from '@/types';
import { cn } from '@/lib/utils';
import { useAnnotator } from './context';

interface Props {
  control: ControlTag;
  /** When set, this control is rendered per-region for the given region id. */
  regionId?: string;
}

export function ChoicesControl({ control, regionId }: Props) {
  const { getDocResult, setDocResult, getPerRegionResult, setPerRegionResult } = useAnnotator();

  const current = regionId
    ? getPerRegionResult(control.name, regionId)?.value.choices ?? []
    : getDocResult(control.name)?.value.choices ?? [];

  const commit = (choices: string[]) => {
    if (regionId) setPerRegionResult(control, regionId, { choices });
    else setDocResult(control, { choices });
  };

  const toggle = (value: string) => {
    const selected = current.includes(value);
    if (control.choice === 'multiple') {
      commit(selected ? current.filter((c) => c !== value) : [...current, value]);
    } else {
      commit(selected ? [] : [value]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {control.options.map((opt) => {
        const selected = current.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            role={control.choice === 'multiple' ? 'checkbox' : 'radio'}
            aria-checked={selected}
            data-choice={opt.value}
            onClick={() => toggle(opt.value)}
            className={cn(
              'text-sm rounded-md border px-3 py-1 transition-all',
              selected ? 'font-medium' : 'bg-background hover:bg-muted',
            )}
            style={
              selected
                ? { backgroundColor: opt.color.bg, borderColor: opt.color.solid, color: opt.color.text }
                : undefined
            }
          >
            {opt.value}
          </button>
        );
      })}
    </div>
  );
}
