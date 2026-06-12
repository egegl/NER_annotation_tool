"use client";

import type { ControlTag } from '@/types';
import { Textarea } from '@/components/ui/textarea';
import { useAnnotator } from './context';

interface Props {
  control: ControlTag;
  regionId?: string;
}

export function TextAreaControl({ control, regionId }: Props) {
  const { getDocResult, setDocResult, getPerRegionResult, setPerRegionResult } = useAnnotator();

  const stored = regionId
    ? getPerRegionResult(control.name, regionId)?.value.text
    : getDocResult(control.name)?.value.text;
  const current = Array.isArray(stored) ? stored.join('\n') : (stored ?? '');

  const commit = (raw: string) => {
    const value = { text: raw ? [raw] : [] };
    if (regionId) setPerRegionResult(control, regionId, value);
    else setDocResult(control, value);
  };

  return (
    <Textarea
      rows={control.rows ?? 3}
      placeholder={control.placeholder}
      value={current}
      onChange={(e) => commit(e.target.value)}
    />
  );
}
