import { NextResponse } from 'next/server';
import type { CaseData } from '@/types';
import { HttpError, requireAdmin, requireUser } from '@/lib/server/auth';
import {
  appendTasksAndAssign,
  createProjectAndAssign,
  getTasksForProject,
  getUserProject,
  getUserProjectId,
  requireVisibleProject,
  updateProjectConfig,
} from '@/lib/server/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handle = (error: unknown) => {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : 'Unexpected error.';
  return NextResponse.json({ error: message }, { status: 400 });
};

/** Any logged-in user: their assigned project (unannotated tasks + config). */
export async function GET() {
  try {
    const user = await requireUser();
    const project = getUserProject(user.id);
    if (!project) return NextResponse.json({ project: null });

    const tasks = getTasksForProject(project.id).map((t) => ({
      id: t.id,
      ID: t.external_id,
      data: JSON.parse(t.data_json) as Record<string, string>,
    }));
    return NextResponse.json({
      project: {
        id: project.id,
        fileName: project.file_name,
        configXml: project.config_xml,
        keywords: project.keywords ?? '',
      },
      tasks,
    });
  } catch (error) {
    return handle(error);
  }
}

/**
 * Admin only: create a new project from an uploaded file and assign the chosen
 * accounts to it. Accounts left off `assignUserIds` keep their current project,
 * so their tasks and annotations are untouched.
 */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = (await request.json()) as {
      fileName?: string;
      configXml?: string;
      keywords?: string;
      cases?: CaseData[];
      assignUserIds?: number[];
    };
    if (!body.fileName || !body.configXml || !Array.isArray(body.cases) || body.cases.length === 0) {
      return NextResponse.json(
        { error: 'fileName, configXml and a non-empty cases array are required.' },
        { status: 400 },
      );
    }
    const assignUserIds = Array.isArray(body.assignUserIds)
      ? body.assignUserIds.filter((id): id is number => Number.isInteger(id))
      : [];
    // Strip any imported annotations so assigned annotators start from scratch.
    const cases = body.cases.map((c) => ({ ID: c.ID, data: c.data, results: [] }));
    const projectId = createProjectAndAssign(
      body.fileName,
      body.configXml,
      body.keywords ?? '',
      cases,
      admin.email,
      assignUserIds,
    );
    return NextResponse.json({ ok: true, count: cases.length, projectId, assigned: assignUserIds.length });
  } catch (error) {
    return handle(error);
  }
}

/**
 * Admin only: the later chunks of a large upload. The client creates the project
 * with the first chunk (POST, no accounts), sends the rest here, and passes
 * `assignUserIds` with the last chunk so accounts only see the project once
 * every case is in.
 */
export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = (await request.json()) as {
      projectId?: number;
      cases?: CaseData[];
      assignUserIds?: number[];
    };
    const projectId = Number(body.projectId);
    if (!Number.isInteger(projectId) || !Array.isArray(body.cases)) {
      return NextResponse.json({ error: 'projectId and a cases array are required.' }, { status: 400 });
    }
    requireVisibleProject(admin, projectId);
    const assignUserIds = Array.isArray(body.assignUserIds)
      ? body.assignUserIds.filter((id): id is number => Number.isInteger(id))
      : [];
    const cases = body.cases.map((c) => ({ ID: c.ID, data: c.data, results: [] }));
    const count = appendTasksAndAssign(projectId, cases, assignUserIds);
    return NextResponse.json({ ok: true, count, projectId, assigned: assignUserIds.length });
  } catch (error) {
    return handle(error);
  }
}

/**
 * Admin only: update a project's labeling config. The client names the project
 * it is showing (`projectId`), so a save from a tab that is still on an older
 * project, or from Reviewer Mode on another file, lands on the project whose
 * config was edited. Without one it falls back to the admin's current project.
 */
export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = (await request.json()) as { configXml?: string; projectId?: number };
    if (!body.configXml) {
      return NextResponse.json({ error: 'configXml is required.' }, { status: 400 });
    }
    const projectId = body.projectId != null ? Number(body.projectId) : getUserProjectId(admin.id);
    if (projectId != null && !Number.isInteger(projectId)) {
      return NextResponse.json({ error: 'projectId must be a project id.' }, { status: 400 });
    }
    if (!projectId) {
      return NextResponse.json({ error: 'No project to configure yet.' }, { status: 400 });
    }
    requireVisibleProject(admin, projectId);
    updateProjectConfig(projectId, body.configXml);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handle(error);
  }
}
