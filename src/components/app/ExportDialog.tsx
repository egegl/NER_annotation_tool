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
import { FileDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/basePath';

interface UserListItem {
  id: number;
  email: string;
  role: 'admin' | 'annotator';
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Admin-only export. Lists every account so the admin can include/exclude whose
 * annotations end up in the file, then downloads a combined Label Studio JSON or
 * a per-(task,user) CSV from /api/export.
 */
export function ExportDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [includeGroundTruth, setIncludeGroundTruth] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(api('/api/admin/users'))
      .then((r) => r.json())
      .then((data) => {
        const list: UserListItem[] = data.users ?? [];
        setUsers(list);
        setSelected(new Set(list.map((u) => u.id))); // default: everyone included
      })
      .catch(() => toast({ variant: 'destructive', title: 'Could not load users.' }))
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

  const handleExport = async (format: 'json' | 'csv') => {
    setExporting(true);
    try {
      const response = await fetch(api('/api/export'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: Array.from(selected), format, includeGroundTruth }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error ?? 'Export failed.');
      }
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] ?? `export.${format}`;

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: 'Export Successful', description: `Downloaded ${filename}.` });
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Export Failed',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export Annotations</DialogTitle>
          <DialogDescription>
            Choose which annotators to include. JSON bundles each task with one
            entry per selected user (Label Studio <code>completed_by</code>); CSV
            writes one row per task and annotator.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-sm font-medium">Annotators</span>
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs text-primary hover:underline"
              disabled={users.length === 0}
            >
              {allSelected ? 'Clear all' : 'Select all'}
            </button>
          </div>

          <div className="max-h-64 space-y-2 overflow-auto">
            {loading && <p className="text-sm text-muted-foreground">Loading users…</p>}
            {!loading && users.length === 0 && (
              <p className="text-sm text-muted-foreground">No accounts yet.</p>
            )}
            {users.map((u) => (
              <div key={u.id} className="flex items-center gap-2">
                <Checkbox
                  id={`export-user-${u.id}`}
                  checked={selected.has(u.id)}
                  onCheckedChange={() => toggle(u.id)}
                />
                <Label htmlFor={`export-user-${u.id}`} className="flex-1 cursor-pointer font-normal">
                  {u.email}
                  {u.role === 'admin' && (
                    <span className="ml-2 text-xs text-muted-foreground">(admin)</span>
                  )}
                </Label>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 border-t pt-3">
            <Checkbox
              id="export-ground-truth"
              checked={includeGroundTruth}
              onCheckedChange={(v) => setIncludeGroundTruth(v === true)}
            />
            <Label htmlFor="export-ground-truth" className="flex-1 cursor-pointer font-normal">
              Include adjudicated ground truth
              <span className="ml-2 text-xs text-muted-foreground">(as “ground_truth”)</span>
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            variant="outline"
            disabled={exporting || (selected.size === 0 && !includeGroundTruth)}
            onClick={() => handleExport('csv')}
          >
            <FileDown className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button disabled={exporting || (selected.size === 0 && !includeGroundTruth)} onClick={() => handleExport('json')}>
            <FileDown className="mr-2 h-4 w-4" /> Label Studio JSON
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
