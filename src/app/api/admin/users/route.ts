import { NextResponse } from 'next/server';
import { HttpError, requireAdmin, type Role } from '@/lib/server/auth';
import { createUser, deleteUser, getUserProjectId, listUsers } from '@/lib/server/repo';
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

/** Admin only: list every account (used by the export picker + management). */
export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ users: listUsers() });
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
    // New accounts join the creating admin's current project (if any), so they
    // pick up the work already in progress; the admin can move them later.
    const projectId = getUserProjectId(admin.id);
    const user = await createUser(body.email, body.password, role, projectId);
    return NextResponse.json({ user });
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
