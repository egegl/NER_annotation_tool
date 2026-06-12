// ---------------------------------------------------------------------------
// Label Studio-compatible annotation model
// ---------------------------------------------------------------------------

/** A single case/task: the imported data row plus its annotation results. */
export interface CaseData {
  ID: string;
  /** Raw imported columns, keyed by column name (resolves `value="$field"`). */
  data: Record<string, string>;
  /** Label Studio-style result array. */
  results: AnnotationResult[];
}

export type AnnotationResult = RegionResult | RelationResult;

/** A region/value result produced by a control tag bound to an object. */
export interface RegionResult {
  id: string;
  from_name: string;
  to_name: string;
  type: 'labels' | 'choices' | 'textarea' | 'rating';
  value: RegionValue;
}

export interface RegionValue {
  // span (labels)
  start?: number;
  end?: number;
  text?: string | string[]; // string for spans, string[] for textarea
  labels?: string[];
  // choices
  choices?: string[];
  // rating
  rating?: number;
}

/** A relation linking two existing regions by id. */
export interface RelationResult {
  type: 'relation';
  from_id: string;
  to_id: string;
  direction: 'right' | 'left' | 'bi';
  labels?: string[];
}

export const isRelation = (r: AnnotationResult): r is RelationResult =>
  (r as RelationResult).type === 'relation';

export const isRegion = (r: AnnotationResult): r is RegionResult =>
  !isRelation(r);

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

/** CSS color values (inline styles) so both the preset palette and custom
 * `background="#hex"` colors render uniformly. */
export interface LabelColor {
  /** Solid color — borders and indicator dots. */
  solid: string;
  /** Translucent fill — span/badge background. */
  bg: string;
  /** Readable text color over the fill. */
  text: string;
}

// ---------------------------------------------------------------------------
// Parsed labeling config
// ---------------------------------------------------------------------------

/** Raw parsed XML node (used to walk layout: View / Header / etc.). */
export interface ConfigNode {
  tag: string;
  attrs: Record<string, string>;
  children: ConfigNode[];
}

/** An object tag (data display), e.g. <Text name="t" value="$text"/>. */
export interface ObjectTag {
  tag: 'Text';
  name: string;
  /** Raw value attribute: a "$field" reference or a literal string. */
  value: string;
}

export type ControlType =
  | 'Labels'
  | 'Choices'
  | 'TextArea'
  | 'Rating'
  | 'Relations';

export interface ControlOption {
  value: string;
  alias?: string;
  hotkey?: string;
  background?: string;
  /** Resolved color (Labels / Choices swatches). */
  color: LabelColor;
}

/** A control tag (annotation input), linked to an object via toName. */
export interface ControlTag {
  type: ControlType;
  name: string;
  /** Object name this control annotates. Relations has none. */
  toName?: string;
  perRegion: boolean;
  /** 'single' | 'multiple' for Choices/Labels. */
  choice: 'single' | 'multiple';
  options: ControlOption[];
  // TextArea
  rows?: number;
  placeholder?: string;
  // Rating
  maxRating?: number;
}

export interface ParsedConfig {
  raw: string;
  valid: boolean;
  errors: string[];
  tree: ConfigNode | null;
  objects: ObjectTag[];
  controls: ControlTag[];
}
