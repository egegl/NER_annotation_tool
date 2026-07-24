import { NextResponse } from 'next/server';
import { HttpError, requireAdmin } from '@/lib/server/auth';
import { deleteProject, getUserProjectId, listProjects } from '@/lib/server/repo';

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
 * Admin only: every project (for the Reviewer Mode / Export project pickers),
 * plus the id of the admin's own currently-assigned project so the pickers can
 * default to it.
 */
export async function GET() {
  try {
    const admin = await requireAdmin();
    return NextResponse.json({
      projects: listProjects(),
      currentProjectId: getUserProjectId(admin.id),
    });
  } catch (error) {
    return handle(error);
  }
}

/**
 * Admin only: delete an unused project (and its cases + annotations, via
 * cascade). Rejected by the repo when any account is still assigned to it.
 */
export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as { id?: number };
    const id = Number(body.id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: 'A valid project id is required.' }, { status: 400 });
    }
    deleteProject(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handle(error);
  }
}
