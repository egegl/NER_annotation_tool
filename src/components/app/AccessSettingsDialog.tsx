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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trash2, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/basePath';
import { readJson } from '@/lib/http';
import { useToast } from '@/hooks/use-toast';
import { MIN_PASSWORD_LENGTH } from '@/lib/password';

type Role = 'admin' | 'annotator';

interface UserItem {
  id: number;
  email: string;
  role: Role;
  /** The project this account is assigned to, or null. */
  projectId: number | null;
  /** That project's file name, or null. */
  projectFile: string | null;
}

interface ProjectOption {
  id: number;
  fileName: string;
}

/** Radix Select needs a non-empty string for every item, so "no project" gets one. */
const NO_PROJECT = 'none';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The signed-in admin's email, so we can flag their own row and block self-delete. */
  currentEmail: string | null;
  /** Called after an account moves to another project. `isSelf` is true when the
   * admin moved their own account, so the page can load the new project. */
  onAccountMoved?: (isSelf: boolean) => void;
}

export function AccessSettingsDialog({ open, onOpenChange, currentEmail, onAccountMoved }: Props) {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserItem[] | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [listError, setListError] = useState('');
  // The account whose project change is being saved (its picker is disabled).
  const [movingId, setMovingId] = useState<number | null>(null);

  // Create-account form.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [role, setRole] = useState<Role>('annotator');
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Delete confirmation.
  const [pendingDelete, setPendingDelete] = useState<UserItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const adminCount = users?.filter((u) => u.role === 'admin').length ?? 0;

  const loadUsers = useCallback(async () => {
    setListError('');
    try {
      const [usersRes, projectsRes] = await Promise.all([
        fetch(api('/api/admin/users')),
        fetch(api('/api/admin/projects')),
      ]);
      const usersResult = await readJson(usersRes);
      const projectsResult = await readJson(projectsRes);
      setUsers(usersResult.users as UserItem[]);
      setProjects((projectsResult.projects ?? []) as ProjectOption[]);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not load accounts.');
    }
  }, []);

  /** Move one account to another existing project (or to none). */
  const handleMove = async (u: UserItem, value: string) => {
    const projectId = value === NO_PROJECT ? null : Number(value);
    if (projectId === u.projectId) return;
    setMovingId(u.id);
    try {
      const res = await fetch(api('/api/admin/users'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id, projectId }),
      });
      await readJson(res);
      const target = projects.find((p) => p.id === projectId)?.fileName;
      toast({
        title: 'Project changed',
        description: target ? `${u.email} now works on ${target}.` : `${u.email} is no longer on a project.`,
      });
      await loadUsers();
      onAccountMoved?.(u.email === currentEmail);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not change the project',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setMovingId(null);
    }
  };

  useEffect(() => {
    if (open) loadUsers();
  }, [open, loadUsers]);

  const resetCreateForm = () => {
    setEmail('');
    setPassword('');
    setConfirm('');
    setRole('annotator');
    setCreateError('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setCreateError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setCreateError('Passwords do not match.');
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch(api('/api/admin/users'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      });
      const result = await readJson(res);
      toast({ title: 'Account created', description: `${result.user.email} (${result.user.role}) can now log in.` });
      resetCreateForm();
      await loadUsers();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create the account.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(api('/api/admin/users'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pendingDelete.id }),
      });
      const result = await readJson(res);
      toast({ title: 'Account deleted', description: `${pendingDelete.email} can no longer log in.` });
      setPendingDelete(null);
      await loadUsers();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not delete account',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetCreateForm(); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Access Settings</DialogTitle>
          <DialogDescription>
            Manage who can log in and which project each account works on. Changing an
            account&apos;s project keeps the annotations it made on the old one.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Existing accounts */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Accounts</h3>
            {listError ? (
              <p className="text-sm text-destructive">{listError}</p>
            ) : users === null ? (
              <p className="text-sm text-muted-foreground">Loading accounts…</p>
            ) : (
              <div className="max-h-[260px] overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead className="w-28">Tier</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead className="w-16 text-right">Remove</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => {
                      const isSelf = u.email === currentEmail;
                      const isLastAdmin = u.role === 'admin' && adminCount <= 1;
                      const disabled = isSelf || isLastAdmin;
                      return (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">
                            {u.email}
                            {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                          </TableCell>
                          <TableCell>
                            <Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className="capitalize">
                              {u.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-1.5">
                            <Select
                              value={u.projectId == null ? NO_PROJECT : String(u.projectId)}
                              onValueChange={(v) => void handleMove(u, v)}
                              disabled={movingId === u.id}
                            >
                              <SelectTrigger
                                className="h-8 w-[13rem] text-sm"
                                aria-label={`Project for ${u.email}`}
                                title={u.projectFile ?? 'No project'}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NO_PROJECT}>
                                  <span className="italic text-muted-foreground">No project</span>
                                </SelectItem>
                                {projects.map((p) => (
                                  <SelectItem key={p.id} value={String(p.id)}>
                                    {p.fileName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              disabled={disabled}
                              title={
                                isSelf
                                  ? 'You cannot delete your own account.'
                                  : isLastAdmin
                                    ? 'You cannot delete the last admin account.'
                                    : `Delete ${u.email}`
                              }
                              onClick={() => setPendingDelete(u)}
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
          </div>

          {/* Create account */}
          <form onSubmit={handleCreate} className="space-y-4 border-t pt-4">
            <h3 className="text-sm font-medium">Create account</h3>
            <div className="space-y-2">
              <Label htmlFor="new-email">Email</Label>
              <Input
                id="new-email"
                type="email"
                placeholder="person@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isCreating}
              />
            </div>
            <div className="space-y-2">
              <Label>Tier</Label>
              <div className="grid grid-cols-2 gap-2">
                {(['annotator', 'admin'] as Role[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-sm capitalize transition-colors',
                      role === r
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted',
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="new-password">Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isCreating}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-confirm">Confirm password</Label>
                <Input
                  id="new-confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  disabled={isCreating}
                />
              </div>
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <div className="flex justify-end">
              <Button type="submit" disabled={isCreating}>
                <UserPlus className="mr-2 h-4 w-4" />
                {isCreating ? 'Creating…' : 'Create account'}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => { if (!o) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the account and <strong>all of its annotations</strong>.
              Their work will no longer appear in exports. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleDelete(); }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting…' : 'Delete account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
