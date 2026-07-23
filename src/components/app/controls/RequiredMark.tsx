"use client";

import type { ControlTag } from '@/types';
import { isRegion } from '@/types';
import { Check } from 'lucide-react';
import { useAnnotator } from './context';

/** Inline "* Required" tag shown beside a required control; turns into a
 * check once the control has an answer. Renders nothing for optional controls. */
export function RequiredMark({ control }: { control: ControlTag }) {
  const { caseData } = useAnnotator();
  if (!control.required) return null;

  const answered = caseData.results.some(
    (r) => isRegion(r) && r.from_name === control.name,
  );

  return answered ? (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-green-600 dark:text-green-400">
      <Check className="h-3 w-3" /> Required
    </span>
  ) : (
    <span className="text-xs font-medium text-destructive">* Required</span>
  );
}
