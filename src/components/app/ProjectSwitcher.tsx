"use client";

import { Check, ChevronsUpDown, FolderOpen, Layers, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface ProjectSummary {
  id: number;
  fileName: string;
  createdAt: string;
  createdBy: string | null;
  assignedCount: number;
  taskCount: number;
}

interface Props {
  /** Every project, newest first (null while the first load is in flight). */
  projects: ProjectSummary[] | null;
  /** The project on screen, or null when the admin is on none. */
  currentProjectId: number | null;
  /** True while a switch is in flight; the trigger is disabled meanwhile. */
  switching?: boolean;
  onSelect: (projectId: number) => void;
  onUpload: () => void;
  onManage: () => void;
  /** Called when the menu opens, so the list can refresh (counts change). */
  onOpen?: () => void;
  className?: string;
}

/**
 * Admin menu in the header's left corner, where a title would sit: it names the
 * project on screen, switches to any other, and holds the project-level actions
 * (upload a new one, manage the list).
 * Picking one makes it the admin's current project; annotation work on the
 * project left behind is kept and reappears on switching back.
 */
export function ProjectSwitcher({
  projects,
  currentProjectId,
  switching = false,
  onSelect,
  onUpload,
  onManage,
  onOpen,
  className,
}: Props) {
  const current = projects?.find((p) => p.id === currentProjectId) ?? null;
  const label = switching ? 'Switching…' : current ? current.fileName : 'Open a project';

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) onOpen?.(); }}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('max-w-[300px] justify-between', className)}
          disabled={switching}
          title={current ? `Project: ${current.fileName}` : undefined}
          aria-label="Switch project"
        >
          <FolderOpen />
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Switch project
        </DropdownMenuLabel>
        <div className="max-h-72 overflow-y-auto">
          {projects === null && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">Loading projects…</p>
          )}
          {projects?.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No projects uploaded yet.</p>
          )}
          {projects?.map((p) => {
            const isCurrent = p.id === currentProjectId;
            return (
              <DropdownMenuItem
                key={p.id}
                onSelect={() => { if (!isCurrent) onSelect(p.id); }}
                className="items-start gap-2"
                aria-current={isCurrent || undefined}
              >
                <Check className={cn('mt-0.5 h-4 w-4 shrink-0', isCurrent ? 'opacity-100' : 'opacity-0')} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.taskCount} case{p.taskCount === 1 ? '' : 's'} · {p.assignedCount} account
                    {p.assignedCount === 1 ? '' : 's'}
                  </p>
                </div>
              </DropdownMenuItem>
            );
          })}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onUpload}>
          <UploadCloud /> Upload new project…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onManage}>
          <Layers /> Manage projects…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
