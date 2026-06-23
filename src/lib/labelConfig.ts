import type {
  ConfigNode,
  ControlOption,
  ControlTag,
  ControlType,
  ObjectTag,
  ParsedConfig,
} from '@/types';
import { generateColor, parseColor } from '@/lib/color';

const OBJECT_TAGS = new Set(['Text']);
const CONTROL_TAGS = new Set([
  'Labels',
  'Choices',
  'TextArea',
  'Rating',
  'Relations',
]);
const VISUAL_TAGS = new Set(['View', 'Header', 'Style']);
const OPTION_TAGS = new Set(['Label', 'Choice', 'Relation']);
const KNOWN_TAGS = new Set([
  ...OBJECT_TAGS,
  ...CONTROL_TAGS,
  ...VISUAL_TAGS,
  ...OPTION_TAGS,
]);

const attrsOf = (el: Element): Record<string, string> => {
  const attrs: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) attrs[attr.name] = attr.value;
  return attrs;
};

const toConfigNode = (el: Element): ConfigNode => ({
  tag: el.tagName,
  attrs: attrsOf(el),
  children: Array.from(el.children).map(toConfigNode),
});

/** Replace `$field` tokens in a Text value with values from the data row. */
export const resolveObjectValue = (
  raw: string,
  data: Record<string, string>,
): string => {
  if (!raw.includes('$')) return raw;
  return raw.replace(/\$([A-Za-z0-9_]+)/g, (_m, field) => data[field] ?? '');
};

const collectOptions = (
  node: ConfigNode,
  childTag: string,
  colorAt: () => number,
): ControlOption[] => {
  const options: ControlOption[] = [];
  for (const child of node.children) {
    if (child.tag !== childTag) continue;
    const value = child.attrs.value ?? '';
    const background = child.attrs.background;
    options.push({
      value,
      alias: child.attrs.alias,
      hotkey: child.attrs.hotkey,
      background,
      color: background ? parseColor(background) : generateColor(colorAt()),
    });
  }
  return options;
};

const buildControl = (
  node: ConfigNode,
  colorAt: () => number,
): ControlTag | null => {
  const type = node.tag as ControlType;
  const a = node.attrs;
  const base = {
    type,
    name: a.name ?? '',
    toName: a.toName,
    perRegion: a.perRegion === 'true',
    choice: a.choice === 'multiple' ? ('multiple' as const) : ('single' as const),
    options: [] as ControlOption[],
  };

  switch (type) {
    case 'Labels':
      return { ...base, options: collectOptions(node, 'Label', colorAt) };
    case 'Choices':
      return { ...base, options: collectOptions(node, 'Choice', colorAt) };
    case 'Relations':
      return { ...base, options: collectOptions(node, 'Relation', colorAt) };
    case 'TextArea':
      return {
        ...base,
        rows: a.rows ? parseInt(a.rows, 10) || 3 : 3,
        placeholder: a.placeholder,
      };
    case 'Rating':
      return { ...base, maxRating: a.maxRating ? parseInt(a.maxRating, 10) || 5 : 5 };
    default:
      return null;
  }
};

/** Parse a Label Studio-style XML labeling config into a typed model. */
export const parseLabelConfig = (xml: string): ParsedConfig => {
  const empty: ParsedConfig = {
    raw: xml,
    valid: false,
    errors: [],
    tree: null,
    objects: [],
    controls: [],
  };

  if (typeof DOMParser === 'undefined') {
    // Server / build context — defer real parsing to the client.
    return { ...empty, errors: ['XML parsing is only available in the browser.'] };
  }

  const trimmed = xml.trim();
  if (!trimmed) return { ...empty, errors: ['Configuration is empty.'] };

  const doc = new DOMParser().parseFromString(trimmed, 'text/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    const detail = parserError.textContent?.replace(/\s+/g, ' ').trim();
    return { ...empty, errors: [`Invalid XML: ${detail || 'could not parse.'}`] };
  }

  const root = doc.documentElement;
  if (!root) return { ...empty, errors: ['Configuration has no root element.'] };

  const tree = toConfigNode(root);

  const objects: ObjectTag[] = [];
  const controls: ControlTag[] = [];
  const errors: string[] = [];
  let colorIndex = 0;
  const colorAt = () => colorIndex++;

  const walk = (node: ConfigNode) => {
    if (OBJECT_TAGS.has(node.tag)) {
      objects.push({ tag: 'Text', name: node.attrs.name ?? '', value: node.attrs.value ?? '' });
    } else if (CONTROL_TAGS.has(node.tag)) {
      const control = buildControl(node, colorAt);
      if (control) controls.push(control);
    } else if (!VISUAL_TAGS.has(node.tag) && !OPTION_TAGS.has(node.tag)) {
      if (!KNOWN_TAGS.has(node.tag)) errors.push(`Unknown tag <${node.tag}>.`);
    }
    node.children.forEach(walk);
  };
  walk(tree);

  // --- validation ---
  const objectNames = new Set(objects.map((o) => o.name));
  if (objects.length === 0) errors.push('Add at least one object tag (e.g. <Text>).');

  for (const o of objects) {
    if (!o.name) errors.push('A <Text> tag is missing a "name" attribute.');
  }

  const seenNames = new Set<string>();
  for (const c of controls) {
    // <Relations> has neither a name nor a toName in Label Studio.
    if (c.type !== 'Relations') {
      if (!c.name) errors.push(`A <${c.type}> tag is missing a "name" attribute.`);
      else if (seenNames.has(c.name)) errors.push(`Duplicate control name "${c.name}".`);
      else seenNames.add(c.name);
    }

    if (c.type !== 'Relations') {
      if (!c.toName) {
        errors.push(`<${c.type} name="${c.name}"> needs a "toName" attribute.`);
      } else if (!objectNames.has(c.toName)) {
        errors.push(`<${c.type} name="${c.name}"> toName="${c.toName}" matches no object tag.`);
      }
    }

    if ((c.type === 'Labels' || c.type === 'Choices') && c.options.length === 0) {
      errors.push(`<${c.type} name="${c.name}"> has no options.`);
    }
  }

  if (controls.length === 0) errors.push('Add at least one control tag (e.g. <Labels>, <Choices>).');

  return {
    raw: xml,
    valid: errors.length === 0,
    errors,
    tree,
    objects,
    controls,
  };
};

/** Labels controls that annotate a given object name. */
export const labelsControlsFor = (config: ParsedConfig, objectName: string): ControlTag[] =>
  config.controls.filter((c) => c.type === 'Labels' && c.toName === objectName);

/**
 * The <Header> node that titles an object's NER section — the header that is the
 * immediate previous sibling of the first <Labels toName="objectName">. Returned
 * (by node identity) so the NER section header can be rendered together with the
 * label bank inside the text box and skipped at its original XML position.
 * Null when the labels have no such leading header.
 */
export const nerHeaderNodeFor = (
  config: ParsedConfig,
  objectName: string,
): ConfigNode | null => {
  const tree = config.tree;
  if (!tree) return null;

  let result: ConfigNode | null = null;
  const visit = (node: ConfigNode): boolean => {
    const kids = node.children;
    for (let i = 0; i < kids.length; i++) {
      const child = kids[i];
      if (child.tag === 'Labels' && child.attrs.toName === objectName) {
        const prev = kids[i - 1];
        result = prev && prev.tag === 'Header' ? prev : null;
        return true; // first matching <Labels> in document order wins
      }
      if (visit(child)) return true;
    }
    return false;
  };
  visit(tree);
  return result;
};

/** Find an option (with its color) by value across all controls. */
export const findOption = (
  config: ParsedConfig,
  controlName: string,
  value: string,
): ControlOption | undefined =>
  config.controls
    .find((c) => c.name === controlName)
    ?.options.find((o) => o.value === value);
