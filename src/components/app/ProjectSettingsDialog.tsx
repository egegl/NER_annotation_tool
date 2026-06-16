"use client";

import { useEffect, useMemo, useState } from 'react';
import type { AnnotationResult, CaseData } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';
import { parseLabelConfig } from '@/lib/labelConfig';
import { TEMPLATES } from '@/lib/configTemplates';
import defaultLabeling from '@/config/labeling.json';
import { Annotator } from './annotator';

const DEFAULT_XML = (defaultLabeling as { xml: string }).xml;

const SAMPLE_TEXT =
  'Acme Corp reported strong quarterly earnings on May 3, 2026. ' +
  'Customers praised the battery life but complained about the price.';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentXml: string;
  onSave: (xml: string) => void;
  /** Current case used as the preview sample (falls back to placeholder text). */
  previewCase?: CaseData;
  /** When true (annotators), the config is view-only: no editing, templates or save. */
  readOnly?: boolean;
}

export function ProjectSettingsDialog({ open, onOpenChange, currentXml, onSave, previewCase, readOnly = false }: Props) {
  const [draft, setDraft] = useState(currentXml);
  const [previewResults, setPreviewResults] = useState<AnnotationResult[]>([]);

  // Reset the editor to the saved config each time the dialog opens.
  useEffect(() => {
    if (open) {
      setDraft(currentXml);
      setPreviewResults([]);
    }
  }, [open, currentXml]);

  const parsed = useMemo(() => parseLabelConfig(draft), [draft]);

  const sampleCase: CaseData = useMemo(
    () => ({
      ID: previewCase?.ID ?? 'preview',
      data: previewCase?.data ?? { text: SAMPLE_TEXT },
      results: previewResults,
    }),
    [previewCase, previewResults],
  );

  const loadTemplate = (xml: string) => {
    setDraft(xml);
    setPreviewResults([]);
  };

  const handleSave = () => {
    if (!parsed.valid) return;
    onSave(draft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Labeling Setup</DialogTitle>
          <DialogDescription>
            {readOnly
              ? 'The shared annotation interface for this project (set by an admin).'
              : 'Define the annotation interface with a Label Studio-style XML configuration. This is shared with every annotator.'}
          </DialogDescription>
        </DialogHeader>

        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <Button
                key={t.id}
                variant="outline"
                size="sm"
                title={t.description}
                onClick={() => loadTemplate(t.xml)}
              >
                {t.name}
              </Button>
            ))}
          </div>
        )}

        <Tabs defaultValue="code" className="w-full">
          <TabsList>
            <TabsTrigger value="code">Code</TabsTrigger>
            <TabsTrigger value="preview" disabled={!parsed.valid}>
              Preview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="code" className="space-y-3">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              readOnly={readOnly}
              className="font-mono text-sm h-[320px]"
              aria-label="Labeling config XML"
            />
            {parsed.valid ? (
              <p className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" /> Configuration is valid.
              </p>
            ) : (
              <div className="space-y-1">
                <p className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" /> {parsed.errors.length} issue
                  {parsed.errors.length === 1 ? '' : 's'} to fix:
                </p>
                <ul className="list-disc list-inside text-sm text-destructive">
                  {parsed.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>

          <TabsContent value="preview">
            <div className="max-h-[360px] overflow-auto rounded-md border p-3 space-y-4">
              {parsed.valid ? (
                <Annotator
                  key={draft}
                  caseData={sampleCase}
                  config={parsed}
                  onChange={setPreviewResults}
                  previewMode
                />
              ) : (
                <p className="text-sm text-muted-foreground">Fix the configuration to preview it.</p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex sm:justify-between">
          {readOnly ? (
            <Button variant="outline" className="ml-auto" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => loadTemplate(DEFAULT_XML)}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reset to default
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={!parsed.valid}>
                  Save
                </Button>
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
