"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ObjectTag, RegionResult } from '@/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import {
  Search,
  ChevronUp,
  ChevronDown,
  X,
  Type as TypeIcon,
  Highlighter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { findOption, labelsControlsFor, resolveObjectValue } from '@/lib/labelConfig';
import { useLocalStorageState } from '@/hooks/useLocalStorageState';
import { findMatches, findKeywordMatches, parseTerms, type Interval } from '@/lib/highlight';
import { useAnnotator } from './context';

interface ReadingPrefs {
  fontSize: number;
  lineHeight: number;
  /** Max line width in `ch`, or null for full width. */
  maxWidth: number | null;
}

const DEFAULT_PREFS: ReadingPrefs = { fontSize: 15, lineHeight: 1.8, maxWidth: null };

export function TextObject({ object }: { object: ObjectTag }) {
  const {
    config,
    caseData,
    previewMode,
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);

  // --- search + reading prefs + keyword watchlist (per-browser) ---
  const [query, setQuery] = useState('');
  const [currentMatch, setCurrentMatch] = useState(0);
  const [prefs, setPrefs] = useLocalStorageState<ReadingPrefs>('bmi.readingPrefs', DEFAULT_PREFS);
  const [watchlistRaw, setWatchlistRaw] = useLocalStorageState<string>('bmi.watchlist', '');
  const watchTerms = useMemo(() => parseTerms(watchlistRaw), [watchlistRaw]);

  const text = resolveObjectValue(object.value, caseData.data);
  const spans = spanRegionsFor(object.name);
  const myLabelControls = labelsControlsFor(config, object.name);

  // Validated, non-overlapping label spans (used for both rendering and as the
  // exclusion mask for search/keyword highlights).
  const validSpans = useMemo(() => {
    const sorted = [...spans].sort((a, b) => (a.value.start ?? 0) - (b.value.start ?? 0));
    const out: RegionResult[] = [];
    let last = 0;
    for (const r of sorted) {
      const s = r.value.start ?? 0;
      const e = r.value.end ?? 0;
      if (s < last || e < s || e > text.length) continue;
      out.push(r);
      last = e;
    }
    return out;
  }, [spans, text.length]);

  const regionIntervals = useMemo<Interval[]>(
    () => validSpans.map((r) => ({ start: r.value.start ?? 0, end: r.value.end ?? 0 })),
    [validSpans],
  );

  const searchMatches = useMemo(
    () => (previewMode ? [] : findMatches(text, query, regionIntervals)),
    [previewMode, text, query, regionIntervals],
  );
  const keywordMatches = useMemo(
    () => (previewMode ? [] : findKeywordMatches(text, watchTerms, regionIntervals)),
    [previewMode, text, watchTerms, regionIntervals],
  );

  // Reset / clamp the active match as the query or matches change.
  useEffect(() => setCurrentMatch(0), [query]);
  useEffect(() => {
    setCurrentMatch((c) => (searchMatches.length === 0 ? 0 : Math.min(c, searchMatches.length - 1)));
  }, [searchMatches.length]);

  // Scroll the active match into view within the (capped, scrollable) note box.
  useEffect(() => {
    if (!query || searchMatches.length === 0) return;
    const el = ref.current?.querySelector('[data-current-match="true"]');
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [currentMatch, query, searchMatches.length]);

  // Intercept Ctrl/Cmd-F to focus our in-note search instead of the browser's,
  // which behaves poorly inside a scroll container.
  useEffect(() => {
    if (previewMode) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewMode]);

  const goToMatch = (delta: number) => {
    if (searchMatches.length === 0) return;
    setCurrentMatch((c) => (c + delta + searchMatches.length) % searchMatches.length);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      goToMatch(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setQuery('');
      searchInputRef.current?.blur();
    }
  };

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

  /** Render plain (unlabelled) text [from, to), overlaying search + keyword marks. */
  const renderPlain = (from: number, to: number): React.ReactNode[] => {
    const inRange = (iv: Interval) => iv.start >= from && iv.end <= to;
    const sMarks = searchMatches
      .map((iv, idx) => ({ ...iv, idx, kind: 'search' as const }))
      .filter(inRange);
    const kMarks = keywordMatches
      .filter(inRange)
      // Search highlights win over watchlist where they overlap.
      .filter((k) => !searchMatches.some((s) => k.start < s.end && k.end > s.start))
      .map((k) => ({ ...k, idx: -1, kind: 'keyword' as const }));
    const marks = [...sMarks, ...kMarks].sort((a, b) => a.start - b.start);

    const nodes: React.ReactNode[] = [];
    let cur = from;
    for (const mk of marks) {
      if (mk.start > cur) nodes.push(text.substring(cur, mk.start));
      const content = text.substring(mk.start, mk.end);
      if (mk.kind === 'search') {
        const isCur = mk.idx === currentMatch;
        nodes.push(
          <mark
            key={`s-${mk.start}`}
            data-current-match={isCur || undefined}
            className={cn(
              'rounded-sm text-black',
              isCur ? 'bg-amber-400 ring-2 ring-amber-500' : 'bg-yellow-200',
            )}
          >
            {content}
          </mark>,
        );
      } else {
        nodes.push(
          <mark
            key={`k-${mk.start}`}
            className="rounded-sm bg-transparent text-inherit underline decoration-2 decoration-sky-500 underline-offset-2"
          >
            {content}
          </mark>,
        );
      }
      cur = mk.end;
    }
    if (cur < to) nodes.push(text.substring(cur, to));
    return nodes;
  };

  const renderText = () => {
    const parts: React.ReactNode[] = [];
    let last = 0;
    validSpans.forEach((region) => {
      const s = region.value.start ?? 0;
      const e = region.value.end ?? 0;
      if (s > last) parts.push(...renderPlain(last, s));
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
          title={labelValue}
        >
          {text.substring(s, e)}
        </span>,
      );
      last = e;
    });
    if (last < text.length) parts.push(...renderPlain(last, text.length));
    return parts;
  };

  const countLabel = query
    ? searchMatches.length > 0
      ? `${currentMatch + 1} / ${searchMatches.length}`
      : '0 / 0'
    : '';

  return (
    <div className="relative">
      {/* Toolbar: in-note search, reading controls, keyword watchlist.
          Hidden in the admin config preview. */}
      {!previewMode && (
      <div className="mb-2 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search this note…  (Ctrl/Cmd-F)"
            className="h-9 pl-8"
            aria-label="Search within the note"
          />
        </div>
        <span className="w-14 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
          {countLabel}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => goToMatch(-1)}
          disabled={searchMatches.length === 0}
          aria-label="Previous match"
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => goToMatch(1)}
          disabled={searchMatches.length === 0}
          aria-label="Next match"
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => setQuery('')}
          disabled={!query}
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </Button>

        {/* Reading controls */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Reading controls">
              <TypeIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 space-y-4" align="end">
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span>Text size</span>
                <span className="text-muted-foreground">{prefs.fontSize}px</span>
              </div>
              <Slider
                min={12}
                max={24}
                step={1}
                value={[prefs.fontSize]}
                onValueChange={([v]) => setPrefs((p) => ({ ...p, fontSize: v }))}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span>Line spacing</span>
                <span className="text-muted-foreground">{prefs.lineHeight.toFixed(1)}</span>
              </div>
              <Slider
                min={1.2}
                max={2.4}
                step={0.1}
                value={[prefs.lineHeight]}
                onValueChange={([v]) => setPrefs((p) => ({ ...p, lineHeight: Math.round(v * 10) / 10 }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Limit line width</span>
              <Button
                variant={prefs.maxWidth ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPrefs((p) => ({ ...p, maxWidth: p.maxWidth ? null : 80 }))}
              >
                {prefs.maxWidth ? 'On' : 'Off'}
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="w-full" onClick={() => setPrefs(DEFAULT_PREFS)}>
              Reset
            </Button>
          </PopoverContent>
        </Popover>

        {/* Keyword watchlist */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={watchTerms.length ? 'default' : 'outline'}
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label="Keyword highlights"
            >
              <Highlighter className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 space-y-2" align="end">
            <div className="space-y-1">
              <p className="text-sm font-medium">Always-highlight keywords</p>
              <p className="text-xs text-muted-foreground">
                Underlined across every note. One per line, or comma-separated.
              </p>
            </div>
            <Textarea
              value={watchlistRaw}
              onChange={(e) => setWatchlistRaw(e.target.value)}
              placeholder={'pain\nibuprofen\nshortness of breath'}
              className="h-32 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {watchTerms.length} term{watchTerms.length === 1 ? '' : 's'} ·{' '}
              {keywordMatches.length} match{keywordMatches.length === 1 ? '' : 'es'} in this note
            </p>
          </PopoverContent>
        </Popover>
      </div>
      )}

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
        className="p-4 border rounded-md min-h-[160px] max-h-[65vh] w-full overflow-auto"
        style={{
          whiteSpace: 'pre-wrap',
          fontSize: `${prefs.fontSize}px`,
          lineHeight: prefs.lineHeight,
          maxWidth: prefs.maxWidth ? `${prefs.maxWidth}ch` : undefined,
        }}
      >
        {renderText()}
      </div>
    </div>
  );
}
