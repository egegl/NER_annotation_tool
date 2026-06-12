"use client";

import React, { useRef, useState } from 'react';
import type { ObjectTag, RegionResult } from '@/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { findOption, labelsControlsFor, resolveObjectValue } from '@/lib/labelConfig';
import { useAnnotator } from './context';

export function TextObject({ object }: { object: ObjectTag }) {
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
  const spans = spanRegionsFor(object.name);
  const myLabelControls = labelsControlsFor(config, object.name);

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

    // If a label is armed for this object, apply it immediately.
    if (armed) {
      const control = config.controls.find((c) => c.name === armed.control);
      if (control && control.toName === object.name) {
        applyLabel(control, start, end, selectedText, armed.value);
        sel.removeAllRanges();
        return;
      }
    }

    // Otherwise open the picker popover (only if there are label controls here).
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

  const renderText = () => {
    const sorted = [...spans].sort((a, b) => (a.value.start ?? 0) - (b.value.start ?? 0));
    const parts: React.ReactNode[] = [];
    let last = 0;
    sorted.forEach((region) => {
      const s = region.value.start ?? 0;
      const e = region.value.end ?? 0;
      if (s < last || e < s || e > text.length) return; // skip overlaps / invalid
      if (s > last) parts.push(text.substring(last, s));
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
            // ring color via box-shadow fallback handled by Tailwind ring; set accent
            ...(isRelSource ? { boxShadow: '0 0 0 2px #f59e0b' } : {}),
          }}
          title={labelValue}
        >
          {text.substring(s, e)}
        </span>,
      );
      last = e;
    });
    if (last < text.length) parts.push(text.substring(last));
    return parts;
  };

  return (
    <div className="relative">
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button ref={triggerRef} className="opacity-0 w-0 h-0 p-0 m-0" />
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
      <div
        ref={ref}
        onMouseUp={handleMouseUp}
        className="text-base leading-relaxed p-4 border rounded-md min-h-[160px] w-full"
        style={{ whiteSpace: 'pre-wrap' }}
      >
        {renderText()}
      </div>
    </div>
  );
}
