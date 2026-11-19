"use client";

import { useState } from 'react';
import { ChevronDown, CircleUser, KeyRound, LogOut, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChangePasswordDialog } from './ChangePasswordDialog';

interface Props {
  email: string;
  role: 'admin' | 'annotator';
  onLogout: () => void;
  /** Admin: open Access Settings (accounts and their projects). Omit to hide it. */
  onAccessSettings?: () => void;
}

/** Header account button: who is signed in, account management (admins),
 * change password, log out. */
export function AccountMenu({ email, role, onLogout, onAccessSettings }: Props) {
  const [passwordOpen, setPasswordOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2 px-2" aria-label="Account settings">
            <CircleUser className="h-5 w-5" />
            <span className="hidden max-w-[180px] truncate text-sm lg:inline">{email}</span>
            <ChevronDown className="h-4 w-4 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="font-normal">
            <p className="text-xs text-muted-foreground">Signed in as</p>
            <p className="truncate text-sm font-medium">{email}</p>
            <Badge variant="secondary" className="mt-1.5 capitalize">
              {role}
            </Badge>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {onAccessSettings && (
            <DropdownMenuItem onSelect={onAccessSettings}>
              <Users /> Access Settings
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setPasswordOpen(true)}>
            <KeyRound /> Change password
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onLogout}>
            <LogOut /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </>
  );
}
