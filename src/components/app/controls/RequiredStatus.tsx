"use client";

import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { requiredControls, unansweredRequiredControls } from '@/lib/labelConfig';
import { useAnnotator } from './context';

/** Summary banner: lists any unanswered required questions, or confirms the
 * case is complete. Renders nothing when the config has no required controls. */
export function RequiredStatus() {
  const { config, caseData } = useAnnotator();
  if (requiredControls(config).length === 0) return null;

  const missing = unansweredRequiredControls(config, caseData);

  if (missing.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-green-600/30 bg-green-600/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        All required questions answered — this case is marked annotated.
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        Answer required question{missing.length > 1 ? 's' : ''} to mark this case
        annotated: <strong>{missing.map((c) => c.name).join(', ')}</strong>
      </span>
    </div>
  );
}
