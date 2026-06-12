import { NextResponse } from 'next/server';
import type { AnnotationResult } from '@/types';
import { HttpError, requireUser } from '@/lib/server/auth';
import { getUserAnnotations, saveUserAnnotation } from '@/lib/server/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handle = (error: unknown) => {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : 'Unexpected error.';
  return NextResponse.json({ error: message }, { status: 400 });
};

/** The current user's own annotations, keyed by task id. Never anyone else's. */
export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ annotations: getUserAnnotations(user.id) });
  } catch (error) {
    return handle(error);
  }
}

/** Upsert the current user's annotation for one task. */
export async function PUT(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { taskId?: number; results?: AnnotationResult[] };
    if (typeof body.taskId !== 'number' || !Array.isArray(body.results)) {
      return NextResponse.json(
        { error: 'taskId (number) and results (array) are required.' },
        { status: 400 },
      );
    }
    // user.id comes from the session — a client cannot write to another user's row.
    saveUserAnnotation(body.taskId, user.id, body.results);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handle(error);
  }
}
