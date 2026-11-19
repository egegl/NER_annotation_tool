import { NextResponse } from 'next/server';
import { HttpError, requireAdmin, type Role } from '@/lib/server/auth';
import {
  assignUserToProject,
  createUser,
  deleteUser,
  getUserProjectId,
  listUsers,
  listUsersForAdmin,
  requireVisibleProject,
} from '@/lib/server/repo';
import { MIN_PASSWORD_LENGTH } from '@/lib/password';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handle = (error: unknown) => {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : 'Unexpected error.';
  return NextResponse.json({ error: message }, { status: 400 });
};

/** Admin only: list every account (used by the export picker + management).
 * Accounts on another admin's project show as on a hidden project, without its
 * id or file name. */
export async function GET() {
  try {
    const admin = await requireAdmin();
    return NextResponse.json({ users: listUsersForAdmin(admin) });
  } catch (error) {
    return handle(error);
  }
}

/** Admin only: create a new account. */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = (await request.json()) as { email?: string; password?: string; role?: Role };
    if (!body.email || !body.password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }
    if (body.password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 },
      );
    }
    const role: Role = body.role === 'admin' ? 'admin' : 'annotator';
    // New annotators join the creating admin's current project (if any), so
    // they pick up the work already in progress; the admin can move them later.
    // New admins start on no project: being on a project makes it visible to
    // them, and admins only see their own projects unless deliberately added.
    const projectId = role === 'admin' ? null : getUserProjectId(admin.id);
    const user = await createUser(body.email, body.password, role, projectId);
    return NextResponse.json({ user });
  } catch (error) {
    return handle(error);
  }
}

/**
 * Admin only: move an account to an existing project (`projectId: null` leaves
 * it on none). Its annotations on other projects are kept, so moving it back
 * restores its earlier work.
 */
export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = (await request.json()) as { id?: number; projectId?: number | null };
    const id = Number(body.id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: 'A valid user id is required.' }, { status: 400 });
    }
    const projectId = body.projectId == null ? null : Number(body.projectId);
    if (projectId !== null && !Number.isInteger(projectId)) {
      return NextResponse.json({ error: 'projectId must be a project id or null.' }, { status: 400 });
    }
    // An admin can only move accounts onto projects they can see.
    if (projectId !== null) requireVisibleProject(admin, projectId);
    assignUserToProject(id, projectId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handle(error);
  }
}

/** Admin only: delete an account (and its annotations, via cascade). Guardrails
 * stop an admin from deleting their own account or the last admin, either of
 * which could lock everyone out of admin. */
export async function DELETE(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = (await request.json()) as { id?: number };
    const id = Number(body.id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: 'A valid user id is required.' }, { status: 400 });
    }
    if (id === admin.id) {
      return NextResponse.json(
        { error: 'You cannot delete your own account.' },
        { status: 400 },
      );
    }

    const users = listUsers();
    const target = users.find((u) => u.id === id);
    if (!target) {
      return NextResponse.json({ error: 'That account no longer exists.' }, { status: 404 });
    }
    if (target.role === 'admin' && users.filter((u) => u.role === 'admin').length <= 1) {
      return NextResponse.json(
        { error: 'You cannot delete the last admin account.' },
        { status: 400 },
      );
    }

    deleteUser(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handle(error);
  }
}
