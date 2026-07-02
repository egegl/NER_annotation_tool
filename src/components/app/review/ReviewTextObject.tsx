"use client";

import React, { useMemo, useRef, useState } from 'react';
import type { AnnotationResult, ObjectTag, RegionResult } from '@/types';
import { isRegion } from '@/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { findOption, labelsControlsFor, nerHeaderNodeFor, resolveObjectValue } from '@/lib/labelConfig';
import { segmentLayers, type Interval } from '@/lib/highlight';
import { annotatorFill, OVERLAP_FILL } from '@/lib/review';
import { useAnnotator } from '../controls/context';
import { LabelsControl } from '../controls/LabelsControl';
import { withLineBreaks } from '../controls/TextObject';

export interface AnnotatorSet {
  key: string;
  label: string;
  results: AnnotationResult[];
}

interface LabeledInterval extends Interval {
  label: string;
}

/** Sorted, in-bounds, non-overlapping spans (the TextObject validation rules). */
const validLabelSpans = (
  results: AnnotationResult[],
  objectName: string,
  textLength: number,
): RegionResult[] => {
  const spans = results.filter(
    (r): r is RegionResult => isRegion(r) && r.type === 'labels' && r.to_name === objectName,
  );
  const sorted = [...spans].sort((a, b) => (a.value.start ?? 0) - (b.value.start ?? 0));
  const out: RegionResult[] = [];
  let last = 0;
  for (const r of sorted) {
    const s = r.value.start ?? 0;
    const e = r.value.end ?? 0;
    if (s < last || e < s || e > textLength) continue;
    out.push(r);
    last = e;
  }
  return out;
};

/**
 * The Reviewer Mode text viewer: the note text with every annotator's label
 * spans overlaid as translucent fills (annotator 1 blue, annotator 2 yellow,
 * overlap green), while the adjudicator's ground-truth spans render as regular
 * labeled spans on top and are edited exactly like in the annotation view
 * (arm a label, select text; click a span to select it).
 */
export function ReviewTextObject({
  object,
  annotatorSets,
}: {
  object: ObjectTag;
  annotatorSets: AnnotatorSet[];
}) {
  const {
    config,
    caseData,
    armed,
    spanRegionsFor,
    applyLabel,
    selectedRegionId,
    setSelectedRegionId,
    relationFrom,
    setRelationFrom,
    armedRelation,
    addRelation,
  } = useAnnotator();

  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);

  const text = resolveObjectValue(object.value, caseData.data);
  const myLabelControls = labelsControlsFor(config, object.name);
  const nerHeader = nerHeaderNodeFor(config, object.name)?.attrs.value;

  // Ground-truth spans (from the provider = the adjudication results).
  const gtSpans = useMemo(
    () => validLabelSpans(spanRegionsFor(object.name), object.name, text.length),
    [spanRegionsFor, object.name, text.length],
  );

  // One overlay layer per annotator, in annotator order.
  const layers = useMemo<LabeledInterval[][]>(
    () =>
      annotatorSets.map((a) =>
        validLabelSpans(a.results, object.name, text.length).map((r) => ({
          start: r.value.start ?? 0,
          end: r.value.end ?? 0,
          label: r.value.labels?.[0] ?? '',
        })),
      ),
    [annotatorSets, object.name, text.length],
  );
  const hasOverlays = layers.some((l) => l.length > 0);

  const handleMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !ref.current) {
      setPopoverOpen(false);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!ref.current.contains(range.commonAncestorContainer)) return;

    const selectedText = range.toString();
    if (selectedText.trim().length === 0) return;

    const pre = document.createRange();
    pre.selectNodeContents(ref.current);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    const end = start + selectedText.length;
    if (start >= end) return;

    // If a label is armed for this object, apply it to the ground truth.
    if (armed) {
      const control = config.controls.find((c) => c.name === armed.control);
      if (control && control.toName === object.name) {
        applyLabel(control, start, end, selectedText, armed.value);
        sel.removeAllRanges();
        return;
      }
    }

    if (myLabelControls.length === 0) return;
    setSelection({ start, end, text: selectedText });
    const trigger = triggerRef.current;
    if (trigger && ref.current) {
      const rect = range.getBoundingClientRect();
      const box = ref.current.getBoundingClientRect();
      trigger.style.position = 'absolute';
      trigger.style.top = `${rect.bottom - box.top + 4}px`;
      trigger.style.left = `${rect.left - box.left}px`;
      setPopoverOpen(true);
    }
  };

  const handlePick = (controlName: string, value: string) => {
    if (!selection) return;
    const control = config.controls.find((c) => c.name === controlName);
    if (control) applyLabel(control, selection.start, selection.end, selection.text, value);
    setPopoverOpen(false);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleSpanClick = (e: React.MouseEvent, region: RegionResult) => {
    e.stopPropagation();
    if (relationFrom && relationFrom !== region.id) {
      addRelation(relationFrom, region.id, armedRelation);
      setRelationFrom(null);
      setSelectedRegionId(region.id);
      return;
    }
    setSelectedRegionId(selectedRegionId === region.id ? null : region.id);
  };

  /** Plain (non-ground-truth) text [from, to) with the annotator overlays. */
  const renderOverlay = (from: number, to: number): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    for (const seg of segmentLayers(from, to, layers)) {
      const content = withLineBreaks(text.substring(seg.start, seg.end), `o-${seg.start}`);
      if (seg.layers.length === 0) {
        nodes.push(...content);
        continue;
      }
      const fill = seg.layers.length > 1 ? OVERLAP_FILL : annotatorFill(seg.layers[0]);
      const title = seg.layers
        .map((idx) => {
          const span = layers[idx].find((iv) => iv.start <= seg.start && seg.end <= iv.end);
          return `${annotatorSets[idx].label}: ${span?.label ?? ''}`;
        })
        .join('  ·  ');
      nodes.push(
        <span
          key={`ov-${seg.start}`}
          className="rounded-sm"
          style={{ backgroundColor: fill.bg, boxShadow: `inset 0 -2px 0 ${fill.solid}` }}
          title={title}
        >
          {content}
        </span>,
      );
    }
    return nodes;
  };

  const renderText = () => {
    const parts: React.ReactNode[] = [];
    let last = 0;
    gtSpans.forEach((region) => {
      const s = region.value.start ?? 0;
      const e = region.value.end ?? 0;
      if (s > last) parts.push(...renderOverlay(last, s));
      const labelValue = region.value.labels?.[0] ?? '';
      const color = findOption(config, region.from_name, labelValue)?.color;
      const isSelected = selectedRegionId === region.id;
      const isRelSource = relationFrom === region.id;
      parts.push(
        <span
          key={region.id}
          data-region-id={region.id}
          onClick={(ev) => handleSpanClick(ev, region)}
          className={cn(
            'rounded-sm px-0.5 mx-px cursor-pointer border align-baseline',
            (isSelected || isRelSource) && 'ring-2 ring-offset-1',
          )}
          style={{
            backgroundColor: color?.bg,
            borderColor: color?.solid,
            color: color?.text,
            ...(isRelSource ? { boxShadow: '0 0 0 2px #f59e0b' } : {}),
          }}
          title={`Ground truth: ${labelValue}`}
        >
          {withLineBreaks(text.substring(s, e), region.id)}
        </span>,
      );
      last = e;
    });
    if (last < text.length) parts.push(...renderOverlay(last, text.length));
    return parts;
  };

  return (
    <div className="relative">
      {hasOverlays && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {annotatorSets.map((a, i) =>
            layers[i].length > 0 ? (
              <span key={a.key} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: annotatorFill(i).bg, border: `1px solid ${annotatorFill(i).solid}` }}
                />
                {a.label}
              </span>
            ) : null,
          )}
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: OVERLAP_FILL.bg, border: `1px solid ${OVERLAP_FILL.solid}` }}
            />
            Overlap
          </span>
          <span>· ground-truth spans use their label colors</span>
        </div>
      )}

      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button ref={triggerRef} className="absolute opacity-0 w-0 h-0 p-0 m-0" />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-1" side="bottom" align="start">
          <div className="flex flex-col gap-1 max-h-64 overflow-auto">
            {myLabelControls.map((control) =>
              control.options.map((opt) => (
                <Button
                  key={`${control.name}-${opt.value}`}
                  variant="ghost"
                  size="sm"
                  className="justify-start w-full"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handlePick(control.name, opt.value)}
                >
                  <span
                    className="w-3 h-3 rounded-full mr-2 shrink-0"
                    style={{ backgroundColor: opt.color.solid }}
                  />
                  {opt.value}
                </Button>
              )),
            )}
          </div>
        </PopoverContent>
      </Popover>

      {(nerHeader || myLabelControls.length > 0) && (
        <div className="mb-2 space-y-2">
          {nerHeader && <h3 className="text-base font-bold text-foreground">{nerHeader}</h3>}
          {myLabelControls.map((control) => (
            <LabelsControl key={control.name} control={control} />
          ))}
        </div>
      )}
      <div
        ref={ref}
        onMouseUp={handleMouseUp}
        className="p-4 border rounded-md min-h-[8rem] max-h-[60vh] w-full overflow-auto"
        style={{ whiteSpace: 'pre-wrap' }}
      >
        {renderText()}
      </div>
    </div>
  );
}
