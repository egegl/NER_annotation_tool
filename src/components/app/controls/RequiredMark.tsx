"use client";

import type { ControlTag } from '@/types';
import { isRegion } from '@/types';
import { Check } from 'lucide-react';
import { useAnnotator } from './context';

/** Inline "* Required" tag shown beside a required control; turns into a
 * check once the control has an answer. Renders nothing for optional controls. */
export function RequiredMark({ control, compact = false }: { control: ControlTag; compact?: boolean }) {
  const { caseData } = useAnnotator();
  if (!control.required) return null;

  const answered = caseData.results.some(
    (r) => isRegion(r) && r.from_name === control.name,
  );

  // In a list of question rows the word would repeat on every line, so the mark
  // shrinks to a red asterisk that becomes a check.
  if (compact) {
    return answered ? (
      <Check className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" aria-label="Answered" />
    ) : (
      <span className="font-medium text-destructive" title="Required" aria-label="Required">*</span>
    );
  }

  return answered ? (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-green-600 dark:text-green-400">
      <Check className="h-3 w-3" /> Required
    </span>
  ) : (
    <span className="text-xs font-medium text-destructive">* Required</span>
  );
}
