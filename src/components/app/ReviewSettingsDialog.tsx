"use client";

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ClipboardCheck, LogOut } from 'lucide-react';
import { api } from '@/lib/basePath';
import { readJson } from '@/lib/http';

interface ProjectListItem {
  id: number;
  fileName: string;
  createdAt: string;
  createdBy: string | null;
  assignedCount: number;
  taskCount: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** True while Reviewer Mode is active (confirm = save settings, plus Exit). */
  active: boolean;
  blind: boolean;
  /** Project to pre-select (the one under review, or the admin's own). */
  defaultProjectId: number | null;
  /** Persist the blind setting and enter (or stay in) Reviewer Mode for a project. */
  onConfirm: (blind: boolean, projectId: number) => Promise<void> | void;
  onExit: () => void;
}

/**
 * Reviewer Mode settings. The admin picks which project to review (accounts can
 * be on different files), toggles blind adjudication, and enters the mode.
 */
export function ReviewSettingsDialog({
  open,
  onOpenChange,
  active,
  blind,
  defaultProjectId,
  onConfirm,
  onExit,
}: Props) {
  const [draftBlind, setDraftBlind] = useState(blind);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectId, setProjectId] = useState<number | null>(defaultProjectId);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraftBlind(blind);
    setLoading(true);
    fetch(api('/api/admin/projects'))
      .then(readJson)
      .then((data) => {
        const list: ProjectListItem[] = data.projects ?? [];
        setProjects(list);
        // Prefer the passed default, else the admin's current project, else newest.
        const fallback = data.currentProjectId ?? list[0]?.id ?? null;
        setProjectId(defaultProjectId ?? fallback);
      })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [open, blind, defaultProjectId]);

  const handleConfirm = async () => {
    if (projectId == null) return;
    setBusy(true);
    try {
      await onConfirm(draftBlind, projectId);
      onOpenChange(false);
    } catch {
      // The parent surfaces the error; keep the dialog open to retry.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reviewer Mode</DialogTitle>
          <DialogDescription>
            Review cases where annotators disagree and record the ground-truth
            decision for each one.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="review-project" className="text-sm font-medium">
            Project to review
          </Label>
          <select
            id="review-project"
            value={projectId ?? ''}
            onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
            disabled={busy || loading || projects.length === 0}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            {projects.length === 0 && <option value="">No projects yet</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fileName} · {p.taskCount} case{p.taskCount === 1 ? '' : 's'} · {p.assignedCount} annotator
                {p.assignedCount === 1 ? '' : 's'}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-md border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="blind-adjudication" className="cursor-pointer">
              Blind adjudication
            </Label>
            <p className="text-xs text-muted-foreground">
              {draftBlind
                ? 'Annotators appear as “Annotator 1” and “Annotator 2”.'
                : 'Annotators appear with their real account emails.'}
            </p>
          </div>
          <Switch
            id="blind-adjudication"
            checked={draftBlind}
            onCheckedChange={setDraftBlind}
            disabled={busy}
          />
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {active ? (
            <Button
              variant="outline"
              onClick={() => {
                onExit();
                onOpenChange(false);
              }}
              disabled={busy}
            >
              <LogOut /> Exit Reviewer Mode
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
          )}
          <Button onClick={handleConfirm} disabled={busy || loading || projectId == null}>
            <ClipboardCheck />
            {active ? 'Save settings' : 'Enter Reviewer Mode'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
