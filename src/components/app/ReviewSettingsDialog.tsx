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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** True while Reviewer Mode is active (confirm = save settings, plus Exit). */
  active: boolean;
  blind: boolean;
  /** Persist the blind setting and enter (or stay in) Reviewer Mode. */
  onConfirm: (blind: boolean) => Promise<void> | void;
  onExit: () => void;
}

/**
 * Reviewer Mode settings. Shown when an admin toggles the mode on (confirm
 * enters it) and again while it is active (confirm saves, or exit the mode).
 */
export function ReviewSettingsDialog({ open, onOpenChange, active, blind, onConfirm, onExit }: Props) {
  const [draftBlind, setDraftBlind] = useState(blind);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setDraftBlind(blind);
  }, [open, blind]);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm(draftBlind);
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
              <LogOut className="mr-2 h-4 w-4" /> Exit Reviewer Mode
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
          )}
          <Button onClick={handleConfirm} disabled={busy}>
            <ClipboardCheck className="mr-2 h-4 w-4" />
            {active ? 'Save settings' : 'Enter Reviewer Mode'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
