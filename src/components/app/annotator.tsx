"use client";

import React from 'react';
import type { AnnotationResult, CaseData, ConfigNode, ParsedConfig } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AnnotatorProvider } from './controls/context';
import { TextObject } from './controls/TextObject';
import { LabelsControl } from './controls/LabelsControl';
import { ChoicesControl } from './controls/ChoicesControl';
import { TextAreaControl } from './controls/TextAreaControl';
import { RatingControl } from './controls/RatingControl';
import { RelationsControl } from './controls/RelationsControl';
import { RegionPanel } from './controls/RegionPanel';

interface AnnotatorProps {
  caseData: CaseData;
  config: ParsedConfig;
  onChange: (results: AnnotationResult[]) => void;
  /** True in the admin config preview: hides annotator-only tools (search etc.). */
  previewMode?: boolean;
}

export function Annotator({ caseData, config, onChange, previewMode = false }: AnnotatorProps) {
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

  const renderNode = (node: ConfigNode, key: string): React.ReactNode => {
    switch (node.tag) {
      case 'View':
        return (
          <div key={key} className="space-y-3">
            {node.children.map((c, i) => renderNode(c, `${key}-${i}`))}
          </div>
        );
      case 'Header':
        return (
          <h3 key={key} className="text-sm font-semibold text-foreground mt-2">
            {node.attrs.value}
          </h3>
        );
      case 'Text': {
        const obj = objectByName(node.attrs.name);
        return obj ? <TextObject key={key} object={obj} /> : null;
      }
      case 'Labels': {
        const c = controlByName(node.attrs.name);
        return c ? <LabelsControl key={key} control={c} /> : null;
      }
      case 'Choices': {
        const c = controlByName(node.attrs.name);
        return c && !c.perRegion ? <ChoicesControl key={key} control={c} /> : null;
      }
      case 'TextArea': {
        const c = controlByName(node.attrs.name);
        return c && !c.perRegion ? <TextAreaControl key={key} control={c} /> : null;
      }
      case 'Rating': {
        const c = controlByName(node.attrs.name);
        return c && !c.perRegion ? <RatingControl key={key} control={c} /> : null;
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
    <AnnotatorProvider config={config} caseData={caseData} onChange={onChange} previewMode={previewMode}>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Annotate</CardTitle>
          <CardDescription>Annotate according to the labeling setup.</CardDescription>
        </CardHeader>
        <CardContent>{config.tree && renderNode(config.tree, 'root')}</CardContent>
      </Card>

      {showPanel && (
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Regions</CardTitle>
            <CardDescription>Labeled spans, per-region values, and relations.</CardDescription>
          </CardHeader>
          <CardContent>
            <RegionPanel />
          </CardContent>
        </Card>
      )}
    </AnnotatorProvider>
  );
}
