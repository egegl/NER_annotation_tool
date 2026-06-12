import { NextResponse } from 'next/server';
import { createSession, verifyLogin } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  const user = await verifyLogin(email, password);
  if (!user) {
    return NextResponse.json(
      { error: 'Invalid credentials. Please check your email and password.' },
      { status: 401 },
    );
  }

  await createSession(user.id);
  return NextResponse.json({ email: user.email, role: user.role });
}
