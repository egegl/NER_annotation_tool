"use client";

import React, { useMemo } from 'react';
import type {
  AnnotationResult,
  CaseData,
  ConfigNode,
  ControlTag,
  ParsedConfig,
  RegionResult,
} from '@/types';
import { isRegion, isRelation } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { findOption, labelsControlsFor, nerHeaderNodeFor } from '@/lib/labelConfig';
import {
  annotatorFill,
  questionSignature,
  relationsSignature,
  type ReviewAnnotator,
} from '@/lib/review';
import { AnnotatorProvider, genId, useAnnotator } from '../controls/context';
import { ChoicesControl } from '../controls/ChoicesControl';
import { TextAreaControl } from '../controls/TextAreaControl';
import { RatingControl } from '../controls/RatingControl';
import { RelationsControl } from '../controls/RelationsControl';
import { RegionPanel } from '../controls/RegionPanel';
import { ReviewTextObject, type AnnotatorSet } from './ReviewTextObject';

interface ReviewWorkspaceProps {
  caseData: CaseData;
  config: ParsedConfig;
  annotators: ReviewAnnotator[];
  /** annotator key -> that annotator's results for this case. */
  annotationsByKey: Record<string, AnnotationResult[]>;
  groundTruth: AnnotationResult[];
  onGroundTruthChange: (results: AnnotationResult[]) => void;
}

type AcceptFn = (control: ControlTag, source: AnnotationResult[]) => void;

const excerpt = (t: string | string[] | undefined, max = 36): string => {
  const s = typeof t === 'string' ? t : '';
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

/** One doc-level or per-region result's value, read-only. */
function ValueDisplay({ control, result }: { control: ControlTag; result: RegionResult }) {
  const { config } = useAnnotator();
  switch (result.type) {
    case 'choices':
      return (
        <div className="flex flex-wrap gap-1">
          {(result.value.choices ?? []).map((v) => {
            const color = findOption(config, control.name, v)?.color;
            return (
              <span
                key={v}
                className="rounded-md border px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: color?.bg, borderColor: color?.solid, color: color?.text }}
              >
                {v}
              </span>
            );
          })}
        </div>
      );
    case 'rating': {
      const max = control.maxRating ?? 5;
      const n = result.value.rating ?? 0;
      return (
        <span className="inline-flex items-center gap-0.5" aria-label={`Rated ${n} of ${max}`}>
          {Array.from({ length: max }, (_, i) => (
            <Star
              key={i}
              className={cn(
                'h-3.5 w-3.5',
                i < n ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground',
              )}
            />
          ))}
        </span>
      );
    }
    case 'textarea': {
      const t = result.value.text;
      const joined = (Array.isArray(t) ? t : t != null ? [t] : []).join('\n');
      return <p className="whitespace-pre-wrap text-sm">{joined}</p>;
    }
    default:
      return null;
  }
}

/** One annotator's answer to one question, read-only. */
function AnswerDisplay({ control, results }: { control: ControlTag; results: AnnotationResult[] }) {
  const { config } = useAnnotator();
  const own = results.filter(
    (r): r is RegionResult => isRegion(r) && r.from_name === control.name,
  );
  if (own.length === 0) {
    return <span className="text-sm italic text-muted-foreground">No answer</span>;
  }

  if (control.type === 'Labels') {
    const sorted = [...own].sort((a, b) => (a.value.start ?? 0) - (b.value.start ?? 0));
    return (
      <div className="flex flex-wrap gap-1">
        {sorted.map((r, i) => {
          const label = r.value.labels?.[0] ?? '';
          const color = findOption(config, control.name, label)?.color;
          return (
            <span
              key={`${r.id}-${i}`}
              className="rounded-md border px-1.5 py-0.5 text-xs"
              style={{ backgroundColor: color?.bg, borderColor: color?.solid, color: color?.text }}
            >
              “{excerpt(r.value.text)}” <span className="font-semibold">{label}</span>
            </span>
          );
        })}
      </div>
    );
  }

  if (control.perRegion) {
    return (
      <div className="space-y-1">
        {own.map((r, i) => {
          const anchor = results.find(
            (x): x is RegionResult => isRegion(x) && x.type === 'labels' && x.id === r.id,
          );
          return (
            <div key={`${r.id}-${i}`} className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">“{excerpt(anchor?.value.text, 24)}”</span>
              <ValueDisplay control={control} result={r} />
            </div>
          );
        })}
      </div>
    );
  }

  return <ValueDisplay control={control} result={own[0]} />;
}

/** The current ground-truth spans for one Labels question, removable. */
function GroundTruthSpans({ control }: { control: ControlTag }) {
  const { config, regions, removeRegion } = useAnnotator();
  const own = regions
    .filter((r) => r.type === 'labels' && r.from_name === control.name)
    .sort((a, b) => (a.value.start ?? 0) - (b.value.start ?? 0));
  if (own.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No ground-truth spans yet — accept an annotator, or click a label above the note and
        select text.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {own.map((r) => {
        const label = r.value.labels?.[0] ?? '';
        const color = findOption(config, control.name, label)?.color;
        return (
          <span
            key={r.id}
            className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs"
            style={{ backgroundColor: color?.bg, borderColor: color?.solid, color: color?.text }}
          >
            “{excerpt(r.value.text)}” <span className="font-semibold">{label}</span>
            <button
              type="button"
              aria-label="Remove ground-truth span"
              className="opacity-60 hover:opacity-100"
              onClick={() => removeRegion(r.id)}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}
    </div>
  );
}

/**
 * One question of the stacked comparison: what each annotator answered, then
 * the adjudicator's ground-truth selector (quick-accept per annotator plus the
 * question's own interactive control).
 */
function QuestionComparison({
  control,
  annotatorSets,
  caption,
  onAccept,
}: {
  control: ControlTag;
  annotatorSets: AnnotatorSet[];
  caption?: string;
  onAccept: AcceptFn;
}) {
  const answered = annotatorSets.filter((a) => a.results.length > 0);
  const signatures = new Set(answered.map((a) => questionSignature(a.results, control)));
  const conflict = answered.length >= 2 && signatures.size > 1;
  const agreed = answered.length >= 2 && signatures.size === 1;

  return (
    <div className={cn('space-y-3 rounded-lg border p-3', conflict && 'border-red-400')}>
      {(caption || conflict || agreed) && (
        <div className="flex items-center gap-2">
          {caption && <span className="text-sm font-semibold">{caption}</span>}
          {conflict && (
            <Badge variant="outline" className="border-red-500 text-red-600">
              Conflict
            </Badge>
          )}
          {agreed && (
            <Badge variant="outline" className="border-green-500 text-green-600">
              Agreed
            </Badge>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        {annotatorSets.map((a, i) => (
          <div key={a.key} className="flex items-start gap-2">
            <span className="inline-flex w-28 shrink-0 items-center gap-1.5 pt-0.5 text-xs font-medium">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: annotatorFill(i).solid }}
              />
              <span className="truncate" title={a.label}>
                {a.label}
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <AnswerDisplay control={control} results={a.results} />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-md border border-dashed border-primary/50 bg-primary/5 p-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ground truth
          </span>
          {annotatorSets.map((a) => (
            <Button
              key={a.key}
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={a.results.length === 0}
              onClick={() => onAccept(control, a.results)}
            >
              Accept {a.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onAccept(control, [])}
          >
            Clear
          </Button>
        </div>
        {control.type === 'Labels' ? (
          <GroundTruthSpans control={control} />
        ) : control.perRegion ? (
          <div className="space-y-1">
            <AnswerDisplayForGroundTruth control={control} />
            <p className="text-xs text-muted-foreground">
              Per-region answers attach to ground-truth regions (see the Regions panel).
            </p>
          </div>
        ) : control.type === 'Choices' ? (
          <ChoicesControl control={control} />
        ) : control.type === 'TextArea' ? (
          <TextAreaControl control={control} />
        ) : control.type === 'Rating' ? (
          <RatingControl control={control} />
        ) : null}
      </div>
    </div>
  );
}

/** The current ground-truth answer (from the provider) rendered read-only. */
function AnswerDisplayForGroundTruth({ control }: { control: ControlTag }) {
  const { caseData } = useAnnotator();
  return <AnswerDisplay control={control} results={caseData.results} />;
}

/** Relations comparison: what each annotator linked, plus the ground-truth tools. */
function RelationsComparison({
  control,
  annotatorSets,
}: {
  control: ControlTag;
  annotatorSets: AnnotatorSet[];
}) {
  const relationLines = (results: AnnotationResult[]): string[] => {
    const spans = new Map(
      results
        .filter((r): r is RegionResult => isRegion(r) && r.type === 'labels')
        .map((r) => [r.id, r]),
    );
    return results.filter(isRelation).map((rel) => {
      const from = excerpt(spans.get(rel.from_id)?.value.text, 18) || '?';
      const to = excerpt(spans.get(rel.to_id)?.value.text, 18) || '?';
      return `“${from}” → “${to}”${rel.labels?.[0] ? ` (${rel.labels[0]})` : ''}`;
    });
  };

  const answered = annotatorSets.filter((a) => a.results.length > 0);
  const signatures = new Set(answered.map((a) => relationsSignature(a.results)));
  const conflict = answered.length >= 2 && signatures.size > 1;

  return (
    <div className={cn('space-y-3 rounded-lg border p-3', conflict && 'border-red-400')}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">Relations</span>
        {conflict && (
          <Badge variant="outline" className="border-red-500 text-red-600">
            Conflict
          </Badge>
        )}
      </div>
      <div className="space-y-1.5">
        {annotatorSets.map((a, i) => {
          const lines = relationLines(a.results);
          return (
            <div key={a.key} className="flex items-start gap-2">
              <span className="inline-flex w-28 shrink-0 items-center gap-1.5 pt-0.5 text-xs font-medium">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: annotatorFill(i).solid }}
                />
                <span className="truncate" title={a.label}>
                  {a.label}
                </span>
              </span>
              <div className="min-w-0 flex-1 space-y-0.5 text-xs">
                {lines.length === 0 ? (
                  <span className="italic text-muted-foreground">No relations</span>
                ) : (
                  lines.map((l, j) => <p key={j}>{l}</p>)
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="space-y-2 rounded-md border border-dashed border-primary/50 bg-primary/5 p-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ground truth
        </span>
        <RelationsControl control={control} />
      </div>
    </div>
  );
}

/**
 * The Reviewer Mode workspace for one case: the source text with all
 * annotators' highlights overlaid, then a stacked per-question comparison with
 * a ground-truth selector. Ground truth is edited through the standard
 * annotation controls (wired to the adjudication results via the provider).
 */
export function ReviewWorkspace({
  caseData,
  config,
  annotators,
  annotationsByKey,
  groundTruth,
  onGroundTruthChange,
}: ReviewWorkspaceProps) {
  const annotatorSets = useMemo<AnnotatorSet[]>(
    () => annotators.map((a) => ({ ...a, results: annotationsByKey[a.key] ?? [] })),
    [annotators, annotationsByKey],
  );

  const gtCase = useMemo<CaseData>(
    () => ({ ...caseData, results: groundTruth }),
    [caseData, groundTruth],
  );

  if (!config.valid) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Review</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Open <strong>Labeling Setup</strong> and fix the configuration to start reviewing.
          </p>
        </CardContent>
      </Card>
    );
  }

  const answeredCount = annotatorSets.filter((a) => a.results.length > 0).length;

  /** Replace the ground-truth answer for one question with an annotator's
   * (fresh region ids; a Labels accept also carries over the source's
   * per-region answers and relations among the copied spans). */
  const acceptQuestion: AcceptFn = (control, source) => {
    const forControl = (r: AnnotationResult): r is RegionResult =>
      isRegion(r) && r.from_name === control.name;
    const sourceOwn = source.filter(forControl);

    if (control.type === 'Labels') {
      const removedIds = new Set(groundTruth.filter(forControl).map((r) => r.id));
      const kept = groundTruth.filter((r) =>
        isRelation(r)
          ? !removedIds.has(r.from_id) && !removedIds.has(r.to_id)
          : !removedIds.has(r.id),
      );
      const idMap = new Map(sourceOwn.map((r) => [r.id, genId()]));
      const copies: AnnotationResult[] = sourceOwn.map((r) => ({ ...r, id: idMap.get(r.id)! }));
      for (const r of source) {
        if (isRegion(r) && r.from_name !== control.name && idMap.has(r.id)) {
          copies.push({ ...r, id: idMap.get(r.id)! });
        } else if (isRelation(r) && idMap.has(r.from_id) && idMap.has(r.to_id)) {
          copies.push({ ...r, from_id: idMap.get(r.from_id)!, to_id: idMap.get(r.to_id)! });
        }
      }
      onGroundTruthChange([...kept, ...copies]);
      return;
    }

    const rest = groundTruth.filter((r) => !forControl(r));

    if (control.perRegion) {
      // Re-anchor the source's per-region answers onto ground-truth spans that
      // cover the same character range; answers without a matching span drop.
      const gtSpanIdByAnchor = new Map(
        groundTruth
          .filter((r): r is RegionResult => isRegion(r) && r.type === 'labels')
          .map((r) => [`${r.value.start}:${r.value.end}`, r.id]),
      );
      const copies = sourceOwn.flatMap((r) => {
        const sourceSpan = source.find(
          (x): x is RegionResult => isRegion(x) && x.type === 'labels' && x.id === r.id,
        );
        const gtId = sourceSpan
          ? gtSpanIdByAnchor.get(`${sourceSpan.value.start}:${sourceSpan.value.end}`)
          : undefined;
        return gtId ? [{ ...r, id: gtId }] : [];
      });
      onGroundTruthChange([...rest, ...copies]);
      return;
    }

    onGroundTruthChange([...rest, ...sourceOwn.map((r) => ({ ...r, id: genId() }))]);
  };

  /** Replace the entire ground truth with a copy of one annotator's results. */
  const acceptAll = (source: AnnotationResult[]) => {
    const idMap = new Map(source.filter(isRegion).map((r) => [r.id, genId()]));
    onGroundTruthChange(
      source.map((r) =>
        isRegion(r)
          ? { ...r, id: idMap.get(r.id)! }
          : { ...r, from_id: idMap.get(r.from_id) ?? r.from_id, to_id: idMap.get(r.to_id) ?? r.to_id },
      ),
    );
  };

  const controlByName = (name?: string) => config.controls.find((c) => c.name === name);
  const objectByName = (name?: string) => config.objects.find((o) => o.name === name);

  const nerHeaderNodes = new Set(
    config.objects
      .map((o) => nerHeaderNodeFor(config, o.name))
      .filter((n): n is ConfigNode => n !== null),
  );

  const renderNode = (node: ConfigNode, key: string, prev?: ConfigNode): React.ReactNode => {
    switch (node.tag) {
      case 'View':
        return (
          <div key={key} className="space-y-3">
            {node.children.map((c, i) => renderNode(c, `${key}-${i}`, node.children[i - 1]))}
          </div>
        );
      case 'Header':
        if (nerHeaderNodes.has(node)) return null;
        return (
          <h3 key={key} className="text-base font-bold text-foreground">
            {node.attrs.value}
          </h3>
        );
      case 'Text': {
        const obj = objectByName(node.attrs.name);
        if (!obj) return null;
        const labelsControls = labelsControlsFor(config, obj.name);
        return (
          <div key={key} className="space-y-3">
            <ReviewTextObject object={obj} annotatorSets={annotatorSets} />
            {labelsControls.map((c) => (
              <QuestionComparison
                key={c.name}
                control={c}
                annotatorSets={annotatorSets}
                caption={labelsControls.length > 1 ? c.name : undefined}
                onAccept={acceptQuestion}
              />
            ))}
          </div>
        );
      }
      // The label banks render inside their ReviewTextObject; comparisons for
      // Labels questions render right below the text they annotate.
      case 'Labels':
        return null;
      case 'Choices':
      case 'TextArea':
      case 'Rating': {
        const c = controlByName(node.attrs.name);
        if (!c) return null;
        const hasHeader = prev?.tag === 'Header';
        return (
          <QuestionComparison
            key={key}
            control={c}
            annotatorSets={annotatorSets}
            caption={hasHeader && !c.perRegion ? undefined : c.name}
            onAccept={acceptQuestion}
          />
        );
      }
      case 'Relations': {
        const c = controlByName(node.attrs.name) ?? config.controls.find((x) => x.type === 'Relations');
        return c ? <RelationsComparison key={key} control={c} annotatorSets={annotatorSets} /> : null;
      }
      case 'Label':
      case 'Choice':
      case 'Relation':
      case 'Style':
        return null;
      default:
        return (
          <React.Fragment key={key}>
            {node.children.map((c, i) => renderNode(c, `${key}-${i}`, node.children[i - 1]))}
          </React.Fragment>
        );
    }
  };

  const showPanel = config.controls.some(
    (c) => c.type === 'Labels' || c.type === 'Relations' || c.perRegion,
  );

  return (
    <AnnotatorProvider config={config} caseData={gtCase} onChange={onGroundTruthChange}>
      <Card className="shadow-lg">
        <CardHeader className="p-3 pb-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Adjudication</CardTitle>
            <div className="flex flex-wrap gap-2">
              {annotatorSets.map((a) => (
                <Button
                  key={a.key}
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={a.results.length === 0}
                  onClick={() => acceptAll(a.results)}
                >
                  Accept all from {a.label}
                </Button>
              ))}
            </div>
          </div>
          {answeredCount < 2 && (
            <p className="text-sm text-muted-foreground">
              {answeredCount === 0
                ? 'No annotator has annotated this case yet.'
                : 'Only one annotator has annotated this case so far.'}
            </p>
          )}
        </CardHeader>
        <CardContent className="p-3">{config.tree && renderNode(config.tree, 'root')}</CardContent>
      </Card>

      {showPanel && (
        <Card className="shadow-lg">
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-base">Ground-truth regions</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <RegionPanel />
          </CardContent>
        </Card>
      )}
    </AnnotatorProvider>
  );
}
