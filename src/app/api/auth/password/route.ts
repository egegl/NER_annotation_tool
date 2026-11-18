import { NextResponse } from 'next/server';
import {
  HttpError,
  changePassword,
  currentSessionToken,
  requireUser,
} from '@/lib/server/auth';
import { MIN_PASSWORD_LENGTH } from '@/lib/password';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Any signed-in user: change their own password (current password required). */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    let body: { currentPassword?: string; newPassword?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const { currentPassword, newPassword } = body;
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Current and new password are required.' },
        { status: 400 },
      );
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 },
      );
    }
    if (newPassword === currentPassword) {
      return NextResponse.json(
        { error: 'New password must be different from the current one.' },
        { status: 400 },
      );
    }

    const ok = await changePassword(
      user.id,
      currentPassword,
      newPassword,
      await currentSessionToken(),
    );
    if (!ok) {
      return NextResponse.json(
        { error: 'Your current password is incorrect.', field: 'current' },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Password change failed', error);
    return NextResponse.json(
      { error: 'Could not change the password. Please try again.' },
      { status: 500 },
    );
  }
}
