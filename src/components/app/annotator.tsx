"use client";

import React from 'react';
import type { AnnotationResult, CaseData, ConfigNode, ControlTag, ParsedConfig } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AnnotatorProvider } from './controls/context';
import { TextObject } from './controls/TextObject';
import { ChoicesControl } from './controls/ChoicesControl';
import { TextAreaControl } from './controls/TextAreaControl';
import { RatingControl } from './controls/RatingControl';
import { RelationsControl } from './controls/RelationsControl';
import { RegionPanel } from './controls/RegionPanel';
import { RequiredMark } from './controls/RequiredMark';
import { nerHeaderNodeFor } from '@/lib/labelConfig';

interface AnnotatorProps {
  caseData: CaseData;
  config: ParsedConfig;
  onChange: (results: AnnotationResult[]) => void;
  /** Admin-set always-highlight keywords (free-form: newlines or commas). */
  adminKeywords?: string;
  /** True in the admin config preview: hides annotator-only tools (search etc.). */
  previewMode?: boolean;
}

export function Annotator({ caseData, config, onChange, adminKeywords = '', previewMode = false }: AnnotatorProps) {
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

  const controlByName = (name?: string) =>
    config.controls.find((c) => c.name === name);
  const objectByName = (name?: string) =>
    config.objects.find((o) => o.name === name);

  // An NER section's header renders inside its text box (with the label bank),
  // so skip it at its original XML position.
  const nerHeaderNodes = new Set(
    config.objects
      .map((o) => nerHeaderNodeFor(config, o.name))
      .filter((n): n is ConfigNode => n !== null),
  );

  // Map each required doc-level control's preceding <Header> (its question text)
  // to the control, so the "Required" tag renders inline with the question
  // instead of on its own line above the control.
  const DOC_CONTROL_TAGS = new Set(['Choices', 'TextArea', 'Rating']);
  const requiredHeaderFor = new Map<ConfigNode, ControlTag>();
  const mapRequiredHeaders = (node: ConfigNode) => {
    const kids = node.children;
    for (let i = 0; i < kids.length; i++) {
      const child = kids[i];
      if (DOC_CONTROL_TAGS.has(child.tag)) {
        const ctrl = controlByName(child.attrs.name);
        const prev = kids[i - 1];
        if (ctrl?.required && !ctrl.perRegion && prev?.tag === 'Header') {
          requiredHeaderFor.set(prev, ctrl);
        }
      }
      mapRequiredHeaders(child);
    }
  };
  if (config.tree) mapRequiredHeaders(config.tree);
  const controlsWithHeaderMark = new Set(requiredHeaderFor.values());

  const renderNode = (node: ConfigNode, key: string): React.ReactNode => {
    switch (node.tag) {
      case 'View':
        return (
          <div key={key} className="space-y-3">
            {node.children.map((c, i) => renderNode(c, `${key}-${i}`))}
          </div>
        );
      case 'Header': {
        if (nerHeaderNodes.has(node)) return null;
        const reqControl = requiredHeaderFor.get(node);
        return (
          <h3 key={key} className="flex items-center gap-2 text-base font-bold text-foreground">
            {node.attrs.value}
            {reqControl && <RequiredMark control={reqControl} />}
          </h3>
        );
      }
      case 'Text': {
        const obj = objectByName(node.attrs.name);
        return obj ? <TextObject key={key} object={obj} /> : null;
      }
      case 'Labels':
        // The NER label bank renders inside its target <Text> (TextObject),
        // between the search toolbar and the note text — not at its XML position.
        return null;
      case 'Choices': {
        const c = controlByName(node.attrs.name);
        if (!c || c.perRegion) return null;
        // The "Required" tag renders next to the question <Header> when there is
        // one; otherwise it falls back to just above the control.
        if (controlsWithHeaderMark.has(c)) return <ChoicesControl key={key} control={c} />;
        return (
          <div key={key} className="space-y-1.5">
            <RequiredMark control={c} />
            <ChoicesControl control={c} />
          </div>
        );
      }
      case 'TextArea': {
        const c = controlByName(node.attrs.name);
        if (!c || c.perRegion) return null;
        if (controlsWithHeaderMark.has(c)) return <TextAreaControl key={key} control={c} />;
        return (
          <div key={key} className="space-y-1.5">
            <RequiredMark control={c} />
            <TextAreaControl control={c} />
          </div>
        );
      }
      case 'Rating': {
        const c = controlByName(node.attrs.name);
        if (!c || c.perRegion) return null;
        if (controlsWithHeaderMark.has(c)) return <RatingControl key={key} control={c} />;
        return (
          <div key={key} className="space-y-1.5">
            <RequiredMark control={c} />
            <RatingControl control={c} />
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
    <AnnotatorProvider config={config} caseData={caseData} onChange={onChange} adminKeywords={adminKeywords} previewMode={previewMode}>
      <Card className="shadow-lg">
        <CardContent className="p-3 space-y-3">
          {config.tree && renderNode(config.tree, 'root')}
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
    </AnnotatorProvider>
  );
}
