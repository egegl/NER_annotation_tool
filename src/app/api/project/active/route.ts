import { NextResponse } from 'next/server';
import { HttpError, requireAdmin } from '@/lib/server/auth';
import { assignUserToProject } from '@/lib/server/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handle = (error: unknown) => {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : 'Unexpected error.';
  return NextResponse.json({ error: message }, { status: 400 });
};

/**
 * Admin only: open another project, i.e. make it the admin's own current
 * project. Labeling Setup, Export and new accounts then default to it.
 * Annotators stay on the project an admin assigns them.
 */
export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = (await request.json()) as { projectId?: number };
    const projectId = Number(body.projectId);
    if (!Number.isInteger(projectId)) {
      return NextResponse.json({ error: 'A valid projectId is required.' }, { status: 400 });
    }
    assignUserToProject(admin.id, projectId);
    return NextResponse.json({ ok: true, projectId });
  } catch (error) {
    return handle(error);
  }
}
