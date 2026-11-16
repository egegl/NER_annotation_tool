"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { AnnotationResult, CaseData, ConfigNode, ControlTag, ParsedConfig } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AnnotatorProvider, useAnnotator } from './controls/context';
import { TextObject, type TextPane } from './controls/TextObject';
import { ChoicesControl } from './controls/ChoicesControl';
import { TextAreaControl } from './controls/TextAreaControl';
import { RatingControl } from './controls/RatingControl';
import { RelationsControl } from './controls/RelationsControl';
import { RegionPanel } from './controls/RegionPanel';
import { RequiredMark } from './controls/RequiredMark';
import { nerHeaderNodeFor } from '@/lib/labelConfig';
import { useLocalStorageState } from '@/hooks/useLocalStorageState';

/** Case navigation the page lends to the keyboard shortcuts. */
export interface AnnotatorNav {
  next: () => void;
  prev: () => void;
  nextUnannotated: () => void;
}

interface AnnotatorProps {
  caseData: CaseData;
  config: ParsedConfig;
  onChange: (results: AnnotationResult[]) => void;
  /** Admin-set always-highlight keywords (free-form: newlines or commas). */
  adminKeywords?: string;
  /** True in the admin config preview: hides annotator-only tools (search etc.). */
  previewMode?: boolean;
  nav?: AnnotatorNav;
}

const DOC_CONTROL_TAGS = new Set(['Choices', 'TextArea', 'Rating']);
const TEXT_SIDE_TAGS = new Set(['Text', 'Labels', 'Relations']);

/** From this many document-level questions on, the annotator is in question
 * mode: each question is one compact row, the rows take keyboard answers, and
 * on wide screens the text stays pinned beside them instead of above them. */
const QUESTION_MODE_MIN = 3;

/** A document-level control with the <Header> that titles it, if any. */
interface Question {
  node: ConfigNode;
  control: ControlTag;
  header: ConfigNode | null;
}

const contains = (node: ConfigNode, test: (n: ConfigNode) => boolean): boolean =>
  test(node) || node.children.some((c) => contains(c, test));

/** Everything about the layout that follows from the config alone. */
const planLayout = (config: ParsedConfig) => {
  // An NER section's header renders inside its text box (with the label bank),
  // so it is skipped at its original XML position.
  const nerHeaders = new Set(
    config.objects
      .map((o) => nerHeaderNodeFor(config, o.name))
      .filter((n): n is ConfigNode => n !== null),
  );

  const questions: Question[] = [];
  const visit = (node: ConfigNode) => {
    node.children.forEach((child, i) => {
      if (DOC_CONTROL_TAGS.has(child.tag)) {
        const control = config.controls.find((c) => c.name === child.attrs.name);
        if (control && !control.perRegion) {
          const prev = node.children[i - 1];
          const header = prev?.tag === 'Header' && !nerHeaders.has(prev) ? prev : null;
          questions.push({ node: child, control, header });
        }
      }
      visit(child);
    });
  };
  if (config.tree) visit(config.tree);

  const questionOf = new Map(questions.map((q) => [q.node, q]));
  const questionHeaders = new Set(
    questions.map((q) => q.header).filter((h): h is ConfigNode => h !== null),
  );
  const questionMode = questions.length >= QUESTION_MODE_MIN;

  // Side by side: the root's children go to the text side or the question side.
  // A header goes with whatever follows it. A child that mixes text and
  // questions cannot be split, so the config then stays stacked.
  let split: { textNodes: ConfigNode[]; questionNodes: ConfigNode[] } | null = null;
  if (questionMode && config.tree?.tag === 'View') {
    const children = config.tree.children;
    const kinds = children.map((n) => {
      const text = contains(n, (x) => TEXT_SIDE_TAGS.has(x.tag));
      const question = contains(n, (x) => questionOf.has(x));
      return text && question ? 'mixed' : text ? 'text' : question ? 'question' : 'none';
    });
    if (!kinds.includes('mixed') && kinds.includes('text') && kinds.includes('question')) {
      const textNodes: ConfigNode[] = [];
      const questionNodes: ConfigNode[] = [];
      children.forEach((n, i) => {
        const kind =
          kinds[i] !== 'none'
            ? kinds[i]
            : kinds.slice(i + 1).find((k) => k !== 'none') ??
              kinds.slice(0, i).reverse().find((k) => k !== 'none');
        (kind === 'text' ? textNodes : questionNodes).push(n);
      });
      split = { textNodes, questionNodes };
    }
  }

  // In the pinned text column, a text the questions are about keeps its full
  // height (up to a cap) and the other texts, the context, share what is left.
  const asked = new Set(questions.map((q) => q.control.toName));
  const names = config.objects.map((o) => o.name);
  const askedCount = names.filter((n) => asked.has(n)).length;
  const paneOf = (name: string): TextPane | undefined => {
    if (!split) return undefined;
    if (names.length < 2 || askedCount === 0 || askedCount === names.length) return 'fill';
    return asked.has(name) ? 'primary' : 'fill';
  };

  return {
    nerHeaders,
    questions,
    questionOf,
    questionHeaders,
    questionMode,
    split,
    paneOf,
    /** Questions a key press can answer, in document order. */
    keyable: questions.filter((q) => q.control.type !== 'TextArea'),
  };
};

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border bg-muted px-1 font-sans text-[0.7rem] leading-4 text-foreground">
      {children}
    </kbd>
  );
}

export function Annotator({ caseData, config, onChange, adminKeywords = '', previewMode = false, nav }: AnnotatorProps) {
  if (!config.valid) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Annotate</CardTitle>
          <CardDescription>The labeling configuration is invalid.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Open <strong>Labeling Setup</strong> and fix the configuration to start annotating.
          </p>
          {config.errors.length > 0 && (
            <ul className="mt-2 list-disc list-inside text-sm text-destructive">
              {config.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <AnnotatorProvider config={config} caseData={caseData} onChange={onChange} adminKeywords={adminKeywords} previewMode={previewMode}>
      <AnnotatorBody nav={nav} />
    </AnnotatorProvider>
  );
}

function AnnotatorBody({ nav }: { nav?: AnnotatorNav }) {
  const { config, previewMode, getDocResult, setDocResult } = useAnnotator();
  const plan = useMemo(() => planLayout(config), [config]);
  const { questionMode, keyable } = plan;
  // Keyboard answers and the pinned text are for the annotator, not the preview.
  const interactive = questionMode && !previewMode;
  const rootRef = useRef<HTMLDivElement>(null);
  // Per-browser: with hints folded away only the active question shows its hint.
  const [showHints, setShowHints] = useLocalStorageState<boolean>('bmi.questionHints', true);
  const anyHint = plan.questions.some((q) => q.header?.attrs.hint);

  const controlByName = (name?: string) =>
    config.controls.find((c) => c.name === name);
  const objectByName = (name?: string) =>
    config.objects.find((o) => o.name === name);

  const isAnswered = (name: string) => getDocResult(name) !== undefined;
  const answeredKey = keyable.map((q) => (isAnswered(q.control.name) ? '1' : '0')).join('');

  // The question the next key press answers: the first open one to start with.
  const [active, setActive] = useState<string | null>(() =>
    interactive ? keyable.find((q) => !isAnswered(q.control.name))?.control.name ?? null : null,
  );

  // When the active question gets its answer, move on to the next open one.
  // A question that allows several choices stays active.
  const lastAnswered = useRef(answeredKey);
  useEffect(() => {
    const before = lastAnswered.current;
    lastAnswered.current = answeredKey;
    if (!interactive || active === null) return;
    const i = keyable.findIndex((q) => q.control.name === active);
    if (i < 0 || before[i] !== '0' || answeredKey[i] !== '1') return;
    if (keyable[i].control.type === 'Choices' && keyable[i].control.choice === 'multiple') return;
    const next =
      keyable.find((_, j) => j > i && answeredKey[j] === '0') ??
      keyable.find((_, j) => answeredKey[j] === '0');
    if (next) setActive(next.control.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answeredKey]);

  // A new case starts at the top of the page, then follows the active question.
  useEffect(() => {
    if (interactive) window.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!interactive || active === null) return;
    rootRef.current
      ?.querySelector(`[data-question="${CSS.escape(active)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [interactive, active]);

  // Keyboard: a digit (or a choice's own hotkey) answers the active question,
  // the arrows move between questions and cases, Enter goes to the next
  // unannotated case. Typing in a field or a dialog is left alone.
  const live = useRef({ active, keyable, nav, getDocResult, setDocResult });
  live.current = { active, keyable, nav, getDocResult, setDocResult };
  useEffect(() => {
    if (!interactive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (
        el &&
        (el.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) ||
          el.closest('[role="dialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]'))
      ) {
        return;
      }
      const s = live.current;
      // A key that gives a question its first answer moves on at once, in this
      // same key press, so the next key lands on the next open question.
      const moveOn = (from: number) => {
        const open = (q: Question) => s.getDocResult(q.control.name) === undefined;
        const next =
          s.keyable.find((q, j) => j > from && open(q)) ??
          s.keyable.find((q, j) => j !== from && open(q));
        if (!next) return;
        s.active = next.control.name;
        setActive(next.control.name);
      };
      const i = s.keyable.findIndex((q) => q.control.name === s.active);
      const control = i >= 0 ? s.keyable[i].control : undefined;
      const letter = e.key.length === 1 ? e.key.toLowerCase() : '';
      const digit = /^[1-9]$/.test(e.key) ? Number(e.key) : 0;

      if (control?.type === 'Choices') {
        const option =
          (letter && control.options.find((o) => o.hotkey?.toLowerCase() === letter)) ||
          (digit ? control.options[digit - 1] : undefined);
        if (option) {
          e.preventDefault();
          const current = s.getDocResult(control.name)?.value.choices ?? [];
          const choices =
            control.choice !== 'multiple'
              ? [option.value]
              : current.includes(option.value)
                ? current.filter((v) => v !== option.value)
                : [...current, option.value];
          s.setDocResult(control, { choices });
          if (control.choice !== 'multiple' && current.length === 0) moveOn(i);
          return;
        }
      }
      if (control?.type === 'Rating' && digit && digit <= (control.maxRating ?? 5)) {
        e.preventDefault();
        const first = s.getDocResult(control.name) === undefined;
        s.setDocResult(control, { rating: digit });
        if (first) moveOn(i);
        return;
      }
      if (control && (e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault();
        s.setDocResult(control, control.type === 'Rating' ? { rating: 0 } : { choices: [] });
        return;
      }

      const step = e.key === 'ArrowDown' || letter === 'j' ? 1 : e.key === 'ArrowUp' || letter === 'k' ? -1 : 0;
      if (step && s.keyable.length > 0) {
        e.preventDefault();
        const to = i < 0 ? (step > 0 ? 0 : s.keyable.length - 1) : Math.min(s.keyable.length - 1, Math.max(0, i + step));
        s.active = s.keyable[to].control.name;
        setActive(s.active);
        return;
      }
      const nav = s.nav;
      if (!nav) return;
      // The case changes before this key press returns, so a key typed right
      // after it already belongs to the new case.
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        flushSync(() => nav.next());
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        flushSync(() => nav.prev());
      } else if (e.key === 'Enter') {
        // Enter on a focused button outside the questions keeps its usual meaning.
        if (el?.closest('button, a') && !el.closest('[data-question]')) return;
        e.preventDefault();
        flushSync(() => nav.nextUnannotated());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [interactive]);

  // Map each required doc-level control's preceding <Header> (its question text)
  // to the control, so the "Required" tag renders inline with the question
  // instead of on its own line above the control.
  const requiredHeaderFor = new Map<ConfigNode, ControlTag>();
  for (const q of plan.questions) {
    if (q.header && q.control.required) requiredHeaderFor.set(q.header, q.control);
  }
  const controlsWithHeaderMark = new Set(requiredHeaderFor.values());

  const required = plan.questions.filter((q) => q.control.required);
  const requiredDone = required.filter((q) => isAnswered(q.control.name)).length;

  const legend = (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-2.5 pb-1 text-xs text-muted-foreground">
      {interactive ? (
        <span className="flex flex-wrap items-center gap-x-1 gap-y-1">
          <Key>1</Key>
          <Key>2</Key>
          <span className="mr-2">answer</span>
          <Key>↑</Key>
          <Key>↓</Key>
          <span className="mr-2">question</span>
          {nav && (
            <>
              <Key>Enter</Key>
              <span className="mr-2">next unannotated</span>
              <Key>←</Key>
              <Key>→</Key>
              <span>case</span>
            </>
          )}
        </span>
      ) : (
        <span />
      )}
      <span className="flex items-center gap-3">
        {interactive && anyHint && (
          <button
            type="button"
            className="underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => setShowHints((v) => !v)}
          >
            {showHints ? 'Hide hints' : 'Show hints'}
          </button>
        )}
        {required.length > 0 && (
          <span className={cn('tabular-nums', requiredDone === required.length && 'text-green-600 dark:text-green-400')}>
            {requiredDone} / {required.length} required
          </span>
        )}
      </span>
    </div>
  );

  const controlBody = (c: ControlTag, isActive: boolean) =>
    c.type === 'Choices' ? (
      <ChoicesControl control={c} keyHints={isActive} />
    ) : c.type === 'TextArea' ? (
      <TextAreaControl control={c} />
    ) : (
      <RatingControl control={c} />
    );

  /** One question as a row: its title and hint on the left, its answer on the right. */
  const renderQuestionRow = (q: Question, key: string) => {
    const c = q.control;
    const isActive = interactive && active === c.name;
    const hint = !interactive || showHints || isActive ? q.header?.attrs.hint : undefined;
    const row = (
      <div
        key={key}
        data-question={c.name}
        // On click, not on mouse down: making a row active can move the rows,
        // and a button that moves under the pointer loses its click.
        onClick={interactive && c.type !== 'TextArea' ? () => setActive(c.name) : undefined}
        className={cn(
          'flex scroll-mb-4 scroll-mt-20 flex-wrap items-start gap-x-4 gap-y-1.5 rounded-md px-2.5 py-1.5 ring-1 ring-inset',
          isActive ? 'bg-primary/5 ring-primary/50' : 'ring-transparent hover:bg-muted/40',
        )}
      >
        {(q.header || c.required) && (
          <div className="min-w-[11rem] flex-1">
            <h3 className="flex flex-wrap items-center gap-x-1.5 text-sm font-semibold text-foreground">
              {q.header?.attrs.value}
              <RequiredMark control={c} compact />
            </h3>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          </div>
        )}
        <div className={c.type === 'TextArea' ? 'basis-full' : 'max-w-full shrink-0'}>
          {controlBody(c, isActive)}
        </div>
      </div>
    );
    if (q !== plan.questions[0]) return row;
    return (
      <React.Fragment key={key}>
        {legend}
        {row}
      </React.Fragment>
    );
  };

  const renderNode = (node: ConfigNode, key: string): React.ReactNode => {
    switch (node.tag) {
      case 'View':
        return (
          <div key={key} className="space-y-3">
            {node.children.map((c, i) => renderNode(c, `${key}-${i}`))}
          </div>
        );
      case 'Header': {
        if (plan.nerHeaders.has(node)) return null;
        // In question mode a question's header is part of its row.
        if (questionMode && plan.questionHeaders.has(node)) return null;
        const reqControl = requiredHeaderFor.get(node);
        return (
          <div key={key}>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              {node.attrs.value}
              {reqControl && <RequiredMark control={reqControl} />}
            </h3>
            {node.attrs.hint && <p className="text-sm text-muted-foreground">{node.attrs.hint}</p>}
          </div>
        );
      }
      case 'Text': {
        const obj = objectByName(node.attrs.name);
        return obj ? <TextObject key={key} object={obj} pane={plan.paneOf(obj.name)} /> : null;
      }
      case 'Labels':
        // The NER label bank renders inside its target <Text> (TextObject),
        // between the search toolbar and the note text, not at its XML position.
        return null;
      case 'Choices':
      case 'TextArea':
      case 'Rating': {
        const q = plan.questionOf.get(node);
        if (!q) return null; // per-region controls live in the region panel
        if (questionMode) return renderQuestionRow(q, key);
        // The "Required" tag renders next to the question <Header> when there is
        // one; otherwise it falls back to just above the control.
        if (controlsWithHeaderMark.has(q.control)) {
          return <React.Fragment key={key}>{controlBody(q.control, false)}</React.Fragment>;
        }
        return (
          <div key={key} className="space-y-1.5">
            <RequiredMark control={q.control} />
            {controlBody(q.control, false)}
          </div>
        );
      }
      case 'Relations': {
        const c = controlByName(node.attrs.name) ?? config.controls.find((x) => x.type === 'Relations');
        return c ? <RelationsControl key={key} control={c} /> : null;
      }
      // Option tags + styling are handled by their parent control.
      case 'Label':
      case 'Choice':
      case 'Relation':
      case 'Style':
        return null;
      default:
        return (
          <React.Fragment key={key}>
            {node.children.map((c, i) => renderNode(c, `${key}-${i}`))}
          </React.Fragment>
        );
    }
  };

  const showPanel = config.controls.some(
    (c) => c.type === 'Labels' || c.type === 'Relations' || c.perRegion,
  );

  return (
    <div ref={rootRef} className="contents">
      <Card className="shadow-lg">
        <CardContent className="p-3 space-y-3">
          {plan.split && !previewMode ? (
            <div className="grid gap-x-5 gap-y-3 xl:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-16 xl:max-h-[calc(100vh-6.5rem)] xl:self-start xl:overflow-y-auto">
                {plan.split.textNodes.map((n, i) => renderNode(n, `text-${i}`))}
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                {plan.split.questionNodes.map((n, i) => renderNode(n, `question-${i}`))}
              </div>
            </div>
          ) : (
            config.tree && renderNode(config.tree, 'root')
          )}
        </CardContent>
      </Card>

      {showPanel && (
        <Card className="shadow-lg">
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-base">Regions</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <RegionPanel />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
