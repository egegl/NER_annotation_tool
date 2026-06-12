"use client";

import type { ControlTag } from '@/types';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAnnotator } from './context';

interface Props {
  control: ControlTag;
  regionId?: string;
}

export function RatingControl({ control, regionId }: Props) {
  const { getDocResult, setDocResult, getPerRegionResult, setPerRegionResult } = useAnnotator();
  const max = control.maxRating ?? 5;

  const current = regionId
    ? getPerRegionResult(control.name, regionId)?.value.rating ?? 0
    : getDocResult(control.name)?.value.rating ?? 0;

  const commit = (rating: number) => {
    const value = { rating };
    if (regionId) setPerRegionResult(control, regionId, value);
    else setDocResult(control, value);
  };

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`Rate ${n}`}
          onClick={() => commit(current === n ? 0 : n)}
        >
          <Star
            className={cn(
              'h-5 w-5',
              n <= current ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground',
            )}
          />
        </button>
      ))}
    </div>
  );
}
