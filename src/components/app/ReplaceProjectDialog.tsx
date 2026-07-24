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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { UploadCloud } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/basePath';

interface UserListItem {
  id: number;
  email: string;
  role: 'admin' | 'annotator';
  projectId: number | null;
  projectFile: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The new file being uploaded, and its case count (for the summary line). */
  fileName: string;
  caseCount: number;
  /** The signed-in admin's email, so we can flag their own row. */
  currentEmail: string | null;
  /** Assign the chosen accounts to the new project (empty = assign nobody). */
  onConfirm: (assignUserIds: number[]) => Promise<void> | void;
}

/**
 * Account picker shown when an admin uploads / replaces a project. Every account
 * is listed with the project it is currently on; the admin ticks which accounts
 * move to the newly uploaded file. Unticked accounts stay on their current
 * project — their tasks and annotations are left untouched.
 */
export function ReplaceProjectDialog({
  open,
  onOpenChange,
  fileName,
  caseCount,
  currentEmail,
  onConfirm,
}: Props) {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set()); // none pre-selected
    setLoading(true);
    fetch(api('/api/admin/users'))
      .then((r) => r.json())
      .then((data) => setUsers(data.users ?? []))
      .catch(() => toast({ variant: 'destructive', title: 'Could not load accounts.' }))
      .finally(() => setLoading(false));
  }, [open, toast]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = users.length > 0 && selected.size === users.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(users.map((u) => u.id)));

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm(Array.from(selected));
      onOpenChange(false);
    } catch {
      // Parent surfaces the error; keep the dialog open to retry.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign the new project</DialogTitle>
          <DialogDescription>
            Choose which accounts move to <strong>{fileName}</strong> ({caseCount} case
            {caseCount === 1 ? '' : 's'}). Unchecked accounts stay on their current
            project; their existing annotations are not deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-sm font-medium">
              Accounts{selected.size > 0 && ` · ${selected.size} selected`}
            </span>
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs text-primary hover:underline"
              disabled={users.length === 0}
            >
              {allSelected ? 'Clear all' : 'Select all'}
            </button>
          </div>

          <div className="max-h-72 space-y-2 overflow-auto">
            {loading && <p className="text-sm text-muted-foreground">Loading accounts…</p>}
            {!loading && users.length === 0 && (
              <p className="text-sm text-muted-foreground">No accounts yet.</p>
            )}
            {users.map((u) => (
              <div key={u.id} className="flex items-center gap-2">
                <Checkbox
                  id={`assign-user-${u.id}`}
                  checked={selected.has(u.id)}
                  onCheckedChange={() => toggle(u.id)}
                />
                <Label
                  htmlFor={`assign-user-${u.id}`}
                  className="flex flex-1 cursor-pointer items-center justify-between gap-2 font-normal"
                >
                  <span className="truncate">
                    {u.email}
                    {u.email === currentEmail && (
                      <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                    )}
                    {u.role === 'admin' && (
                      <span className="ml-1.5 text-xs text-muted-foreground">(admin)</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {u.projectFile ? `on: ${u.projectFile}` : 'no project'}
                  </span>
                </Label>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={busy || loading}>
            <UploadCloud className="mr-2 h-4 w-4" />
            {selected.size === 0
              ? 'Upload without assigning'
              : `Upload & assign to ${selected.size}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
