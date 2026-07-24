"use client";

import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { api } from '@/lib/basePath';
import { useToast } from '@/hooks/use-toast';

interface ProjectItem {
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
  /** The admin's own current project, flagged in the list (never deletable). */
  currentProjectId: number | null;
  /** Called after a successful delete, so the parent can refresh if needed. */
  onDeleted?: () => void;
}

/**
 * Admin-only project management. Lists every uploaded project and lets the admin
 * delete unused ones (no accounts assigned). A project with assignees must have
 * them reassigned first (Replace Project) — its trash button is disabled.
 */
export function ManageProjectsDialog({ open, onOpenChange, currentProjectId, onDeleted }: Props) {
  const { toast } = useToast();
  const [projects, setProjects] = useState<ProjectItem[] | null>(null);
  const [listError, setListError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<ProjectItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadProjects = useCallback(async () => {
    setListError('');
    try {
      const res = await fetch(api('/api/admin/projects'));
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? 'Could not load projects.');
      setProjects(result.projects as ProjectItem[]);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not load projects.');
    }
  }, []);

  useEffect(() => {
    if (open) loadProjects();
  }, [open, loadProjects]);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(api('/api/admin/projects'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pendingDelete.id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? 'Could not delete the project.');
      toast({ title: 'Project deleted', description: `${pendingDelete.fileName} and its annotations were removed.` });
      setPendingDelete(null);
      await loadProjects();
      onDeleted?.();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Projects</DialogTitle>
            <DialogDescription>
              Every uploaded project. Delete an unused one (no accounts assigned) to
              permanently remove its cases and annotations. To delete a project that is
              in use, first move its accounts to another file with Replace Project.
            </DialogDescription>
          </DialogHeader>

          {listError && <p className="text-sm text-destructive">{listError}</p>}

          {projects && projects.length > 0 && (
            <div className="max-h-[420px] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead className="w-20 text-right">Cases</TableHead>
                    <TableHead className="w-24 text-right">Accounts</TableHead>
                    <TableHead className="w-16 text-right">Delete</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((p) => {
                    const inUse = p.assignedCount > 0;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">
                          <span className="truncate">{p.fileName}</span>
                          {p.id === currentProjectId && (
                            <span className="ml-2 text-xs text-muted-foreground">(your project)</span>
                          )}
                          {p.createdBy && (
                            <div className="text-xs text-muted-foreground">by {p.createdBy}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{p.taskCount}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.assignedCount}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            disabled={inUse}
                            title={
                              inUse
                                ? 'Reassign its accounts (Replace Project) before deleting.'
                                : `Delete ${p.fileName}`
                            }
                            onClick={() => setPendingDelete(p)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {projects && projects.length === 0 && (
            <p className="text-sm text-muted-foreground">No projects uploaded yet.</p>
          )}
          {!projects && !listError && (
            <p className="text-sm text-muted-foreground">Loading projects…</p>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => { if (!o) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.fileName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes its {pendingDelete?.taskCount} case
              {pendingDelete?.taskCount === 1 ? '' : 's'} and every annotation on them.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleDelete(); }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting…' : 'Delete project'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
