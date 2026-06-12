import { NextResponse } from 'next/server';
import { HttpError, requireAdmin, type Role } from '@/lib/server/auth';
import { createUser, listUsers } from '@/lib/server/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIN_PASSWORD_LENGTH = 8;

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
    await requireAdmin();
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
    const user = await createUser(body.email, body.password, role);
    return NextResponse.json({ user });
  } catch (error) {
    return handle(error);
  }
}
