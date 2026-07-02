import type {
  AnnotationResult,
  ConfigNode,
  ControlTag,
  ParsedConfig,
  RegionResult,
} from '@/types';
import { isRegion, isRelation } from '@/types';

// ---------------------------------------------------------------------------
// Reviewer Mode (admin adjudication): shared client-side model + comparison.
// ---------------------------------------------------------------------------

export interface ReviewAnnotator {
  /** Stable positional key ("a1", "a2") used in the annotations payload. */
  key: string;
  /** Display name: "Annotator N" under blind adjudication, the email otherwise. */
  label: string;
}

export interface ReviewData {
  settings: { blind: boolean };
  annotators: ReviewAnnotator[];
  /** task id -> annotator key -> that annotator's results. */
  annotations: Record<number, Record<string, AnnotationResult[]>>;
  /** task id -> adjudicated ground-truth results. */
  adjudications: Record<number, AnnotationResult[]>;
}

export type CaseReviewStatus = 'unannotated' | 'agreed' | 'conflict' | 'resolved';

/** Pseudo-question key for relation results (they carry no from_name). */
export const RELATIONS_KEY = '__relations';

// Fill colors for overlaying annotators' text spans (annotator 1 = blue,
// annotator 2 = yellow, any overlap = green), semi-transparent like LabelColor.bg.
export const ANNOTATOR_FILLS = [
  { solid: 'rgb(59, 130, 246)', bg: 'rgba(59, 130, 246, 0.3)' }, // blue
  { solid: 'rgb(234, 179, 8)', bg: 'rgba(234, 179, 8, 0.35)' }, // yellow
  { solid: 'rgb(168, 85, 247)', bg: 'rgba(168, 85, 247, 0.3)' }, // purple
  { solid: 'rgb(249, 115, 22)', bg: 'rgba(249, 115, 22, 0.3)' }, // orange
];
export const OVERLAP_FILL = { solid: 'rgb(34, 197, 94)', bg: 'rgba(34, 197, 94, 0.4)' }; // green

export const annotatorFill = (index: number) =>
  ANNOTATOR_FILLS[index % ANNOTATOR_FILLS.length];

// ---------------------------------------------------------------------------
// Semantic comparison. Region ids are random per user and result order is
// arbitrary, so agreement is decided on normalized signatures per question
// (from_name), never on raw JSON equality.
// ---------------------------------------------------------------------------

const normValue = (r: RegionResult): string => {
  switch (r.type) {
    case 'labels':
      return `${r.value.start}:${r.value.end}:${[...(r.value.labels ?? [])].sort().join('|')}`;
    case 'choices':
      return [...(r.value.choices ?? [])].sort().join('|');
    case 'rating':
      return String(r.value.rating ?? 0);
    case 'textarea': {
      const t = r.value.text;
      const arr = Array.isArray(t) ? t : t != null ? [t] : [];
      return arr.join('\n').trim();
    }
  }
};

/** The span a per-region answer hangs off, as a user-independent anchor. */
const regionAnchor = (results: AnnotationResult[], regionId: string): string => {
  const region = results.find(
    (r): r is RegionResult => isRegion(r) && r.type === 'labels' && r.id === regionId,
  );
  return region ? `${region.value.start}:${region.value.end}` : `?${regionId}`;
};

/**
 * A user-independent signature of one annotator's answer to one question.
 * Equal signatures mean the annotators agree on that question; an unanswered
 * question (no results for the from_name) signs as ''.
 */
export const questionSignature = (
  results: AnnotationResult[],
  control: ControlTag,
): string => {
  const own = results.filter(
    (r): r is RegionResult => isRegion(r) && r.from_name === control.name,
  );
  if (own.length === 0) return '';
  const parts = control.perRegion
    ? own.map((r) => `${regionAnchor(results, r.id)}@${normValue(r)}`)
    : own.map(normValue);
  return parts.sort().join(';;');
};

/** Signature of an annotator's relations, with region ids resolved to spans. */
export const relationsSignature = (results: AnnotationResult[]): string => {
  const anchors = new Map(
    results
      .filter((r): r is RegionResult => isRegion(r) && r.type === 'labels')
      .map((r) => [r.id, `${r.value.start}-${r.value.end}`]),
  );
  return results
    .filter(isRelation)
    .map((rel) => {
      const from = anchors.get(rel.from_id) ?? '?';
      const to = anchors.get(rel.to_id) ?? '?';
      return `${from}>${to}:${rel.direction}:${[...(rel.labels ?? [])].sort().join('|')}`;
    })
    .sort()
    .join(';;');
};

/**
 * The set of question keys (control names, plus RELATIONS_KEY) on which the
 * given annotators' result sets disagree.
 */
export const conflictKeys = (
  config: ParsedConfig,
  resultSets: AnnotationResult[][],
): Set<string> => {
  const conflicts = new Set<string>();
  if (resultSets.length < 2) return conflicts;
  for (const control of config.controls) {
    if (control.type === 'Relations' || !control.name) continue;
    const sigs = new Set(resultSets.map((rs) => questionSignature(rs, control)));
    if (sigs.size > 1) conflicts.add(control.name);
  }
  if (config.controls.some((c) => c.type === 'Relations')) {
    const sigs = new Set(resultSets.map(relationsSignature));
    if (sigs.size > 1) conflicts.add(RELATIONS_KEY);
  }
  return conflicts;
};

/**
 * Review status of one case. Gray/unannotated until at least two annotators
 * have (non-empty) annotations; then agreed, or conflict until a non-empty
 * ground-truth decision resolves it.
 */
export const caseReviewStatus = (
  config: ParsedConfig,
  byAnnotator: Record<string, AnnotationResult[]> | undefined,
  adjudication: AnnotationResult[] | undefined,
): CaseReviewStatus => {
  const sets = Object.values(byAnnotator ?? {}).filter((r) => r.length > 0);
  if (sets.length < 2) return 'unannotated';
  if (conflictKeys(config, sets).size === 0) return 'agreed';
  return adjudication && adjudication.length > 0 ? 'resolved' : 'conflict';
};

export const STATUS_COLORS: Record<CaseReviewStatus, string> = {
  agreed: '#22c55e', // green: complete / annotators agreed
  resolved: '#22c55e', // green: conflict adjudicated
  conflict: '#ef4444', // red: conflict pending review
  unannotated: '#9ca3af', // gray: not (fully) annotated yet
};

// ---------------------------------------------------------------------------
// Agreement metrics
// ---------------------------------------------------------------------------

export interface AgreementStats {
  /** Cases annotated by 2+ annotators. */
  compared: number;
  agreed: number;
  conflicts: number; // pending
  resolved: number;
  /** Simple case-level inter-annotator agreement, 0..1, or null if nothing to compare. */
  agreement: number | null;
}

export const agreementStats = (statuses: CaseReviewStatus[]): AgreementStats => {
  const agreed = statuses.filter((s) => s === 'agreed').length;
  const conflicts = statuses.filter((s) => s === 'conflict').length;
  const resolved = statuses.filter((s) => s === 'resolved').length;
  const compared = agreed + conflicts + resolved;
  return {
    compared,
    agreed,
    conflicts,
    resolved,
    agreement: compared > 0 ? agreed / compared : null,
  };
};

// ---------------------------------------------------------------------------
// Question layout: controls in document order (drives the stacked comparison).
// ---------------------------------------------------------------------------

export interface QuestionBlock {
  control: ControlTag;
  /** The <Header> immediately preceding the control in the XML, if any. */
  heading?: string;
}

/** All named controls (excluding Relations) in config document order, each with
 * its immediately preceding header. */
export const questionBlocksOf = (config: ParsedConfig): QuestionBlock[] => {
  const blocks: QuestionBlock[] = [];
  const questionTags = new Set(['Labels', 'Choices', 'TextArea', 'Rating']);
  const byName = new Map(config.controls.map((c) => [c.name, c]));
  const visit = (node: ConfigNode) => {
    let pendingHeader: string | undefined;
    for (const child of node.children) {
      if (child.tag === 'Header') {
        pendingHeader = child.attrs.value;
      } else if (questionTags.has(child.tag) && byName.has(child.attrs.name ?? '')) {
        blocks.push({ control: byName.get(child.attrs.name ?? '')!, heading: pendingHeader });
        pendingHeader = undefined;
      } else {
        visit(child);
        pendingHeader = undefined;
      }
    }
  };
  if (config.tree) visit(config.tree);
  // Any control missed by the walk (unusual nesting) still gets a block.
  for (const control of config.controls) {
    if (control.type === 'Relations' || !control.name) continue;
    if (!blocks.some((b) => b.control === control)) blocks.push({ control });
  }
  return blocks;
};
