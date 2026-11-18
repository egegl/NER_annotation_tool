"use client";

import { useEffect, useState } from 'react';
import { Check, Eye, EyeOff, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { api } from '@/lib/basePath';
import { useToast } from '@/hooks/use-toast';
import { MIN_PASSWORD_LENGTH } from '@/lib/password';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** A requirement line that turns green with a check once it is met. */
function Rule({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <li className={cn('flex items-center gap-1.5', met ? 'text-green-600' : 'text-muted-foreground')}>
      {met ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
      {children}
    </li>
  );
}

export function ChangePasswordDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [currentError, setCurrentError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Start from a blank form every time the dialog opens.
  useEffect(() => {
    if (open) {
      setCurrent('');
      setNext('');
      setConfirm('');
      setShow(false);
      setCurrentError('');
      setFormError('');
    }
  }, [open]);

  const longEnough = next.length >= MIN_PASSWORD_LENGTH;
  const differs = next.length > 0 && next !== current;
  const matches = confirm.length > 0 && next === confirm;
  const canSubmit = current.length > 0 && longEnough && differs && matches && !saving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setCurrentError('');
    setFormError('');
    try {
      const res = await fetch(api('/api/auth/password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = result.error ?? 'Could not change the password.';
        if (result.field === 'current') setCurrentError(message);
        else setFormError(message);
        return;
      }
      toast({
        title: 'Password changed',
        description: 'Use your new password next time you log in.',
      });
      onOpenChange(false);
    } catch {
      setFormError('Could not reach the server. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const type = show ? 'text' : 'password';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            Confirm your current password, then choose a new one. You stay signed in here; any
            other browser signed in to your account will be logged out.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cp-current">Current password</Label>
            <Input
              id="cp-current"
              type={type}
              autoComplete="current-password"
              autoFocus
              value={current}
              onChange={(e) => {
                setCurrent(e.target.value);
                setCurrentError('');
              }}
              aria-invalid={!!currentError}
              className={cn(currentError && 'border-destructive')}
              disabled={saving}
            />
            {currentError && <p className="text-sm text-destructive">{currentError}</p>}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="cp-new">New password</Label>
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {show ? 'Hide passwords' : 'Show passwords'}
              </button>
            </div>
            <Input
              id="cp-new"
              type={type}
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cp-confirm">Confirm new password</Label>
            <Input
              id="cp-confirm"
              type={type}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={saving}
            />
          </div>

          <ul className="space-y-1 text-xs">
            <Rule met={longEnough}>At least {MIN_PASSWORD_LENGTH} characters</Rule>
            <Rule met={differs}>Different from your current password</Rule>
            <Rule met={matches}>Both new passwords match</Rule>
          </ul>

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {saving ? 'Saving…' : 'Change password'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
