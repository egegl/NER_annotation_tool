"use client";

import type { ControlTag, RegionResult } from '@/types';
import { Button } from '@/components/ui/button';
import { Trash2, Link2, ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { findOption } from '@/lib/labelConfig';
import { useAnnotator } from './context';
import { ChoicesControl } from './ChoicesControl';
import { TextAreaControl } from './TextAreaControl';
import { RatingControl } from './RatingControl';

const excerpt = (r: RegionResult, max = 40) => {
  const t = typeof r.value.text === 'string' ? r.value.text : '';
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

function PerRegionControl({ control, regionId }: { control: ControlTag; regionId: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{control.name}</p>
      {control.type === 'Choices' && <ChoicesControl control={control} regionId={regionId} />}
      {control.type === 'TextArea' && <TextAreaControl control={control} regionId={regionId} />}
      {control.type === 'Rating' && <RatingControl control={control} regionId={regionId} />}
    </div>
  );
}

export function RegionPanel() {
  const {
    config,
    regions,
    relations,
    selectedRegionId,
    setSelectedRegionId,
    relationFrom,
    setRelationFrom,
    removeRegion,
    removeRelation,
    flipRelation,
  } = useAnnotator();

  const spanRegions = regions.filter((r) => r.type === 'labels');
  const perRegionControls = config.controls.filter((c) => c.perRegion);
  const hasRelations = config.controls.some((c) => c.type === 'Relations');

  if (spanRegions.length === 0 && relations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No regions yet. Select text and apply a label to create one.
      </p>
    );
  }

  const regionById = (id: string) => spanRegions.find((r) => r.id === id);

  return (
    <div className="space-y-4">
      {/* Region list */}
      <div className="space-y-2">
        {spanRegions.map((region) => {
          const labelValue = region.value.labels?.[0] ?? '';
          const color = findOption(config, region.from_name, labelValue)?.color;
          const isSelected = selectedRegionId === region.id;
          const applicablePerRegion = perRegionControls.filter((c) => c.toName === region.to_name);
          return (
            <div
              key={region.id}
              className={cn('rounded-md border p-2', isSelected && 'ring-2 ring-primary')}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="flex items-center gap-2 text-left min-w-0"
                  onClick={() => setSelectedRegionId(isSelected ? null : region.id)}
                >
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: color?.solid }}
                  />
                  <span className="text-xs font-medium shrink-0">{labelValue}</span>
                  <span className="text-xs text-muted-foreground truncate">“{excerpt(region)}”</span>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  {hasRelations && (
                    <Button
                      variant={relationFrom === region.id ? 'default' : 'ghost'}
                      size="icon"
                      className="h-7 w-7"
                      title="Link from here"
                      onClick={() => setRelationFrom(relationFrom === region.id ? null : region.id)}
                    >
                      <Link2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    title="Remove region"
                    onClick={() => removeRegion(region.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {isSelected && applicablePerRegion.length > 0 && (
                <div className="mt-2 space-y-2 border-t pt-2">
                  {applicablePerRegion.map((c) => (
                    <PerRegionControl key={c.name} control={c} regionId={region.id} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Relations list */}
      {relations.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Relations</p>
          {relations.map((rel, i) => {
            const from = regionById(rel.from_id);
            const to = regionById(rel.to_id);
            return (
              <div key={i} className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs">
                <span className="truncate">
                  “{from ? excerpt(from, 18) : '?'}” → “{to ? excerpt(to, 18) : '?'}”
                  {rel.labels?.[0] && <span className="ml-1 font-medium">({rel.labels[0]})</span>}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Flip direction" onClick={() => flipRelation(rel)}>
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Delete relation" onClick={() => removeRelation(rel)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
