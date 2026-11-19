import { NextResponse } from 'next/server';
import type { AnnotationResult } from '@/types';
import { HttpError, requireAdmin } from '@/lib/server/auth';
import {
  gatherReview,
  getAdjudications,
  getTaskProjectId,
  getTasksForProject,
  requireVisibleProject,
  saveAdjudication,
  setReviewBlind,
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

/**
 * Admin only: everything the review stream needs: every annotator's results per
 * task, the adjudicated ground truth, and the review settings. With blind
 * adjudication on, annotator identities are masked SERVER-SIDE: the payload
 * carries stable positional keys ("a1", "a2", ordered by user id) and
 * "Annotator N" labels, never emails.
 */
export async function GET(request: Request) {
  try {
    const admin = await requireAdmin();
    const projectId = Number(new URL(request.url).searchParams.get('projectId'));
    if (!Number.isInteger(projectId)) {
      return NextResponse.json({ error: 'A valid projectId is required.' }, { status: 400 });
    }
    const project = requireVisibleProject(admin, projectId);
    const blind = project.review_blind !== 0;

    const { annotators, byTask } = gatherReview(projectId);
    const keyByUserId = new Map(annotators.map((a, i) => [a.userId, `a${i + 1}`]));
    const annotations: Record<number, Record<string, AnnotationResult[]>> = {};
    for (const [taskId, perUser] of byTask) {
      const masked: Record<string, AnnotationResult[]> = {};
      for (const [userId, results] of perUser) {
        masked[keyByUserId.get(userId)!] = results;
      }
      annotations[taskId] = masked;
    }

    const tasks = getTasksForProject(projectId).map((t) => ({
      id: t.id,
      ID: t.external_id,
      data: JSON.parse(t.data_json) as Record<string, string>,
    }));

    return NextResponse.json({
      settings: { blind },
      project: { id: project.id, fileName: project.file_name, configXml: project.config_xml },
      tasks,
      annotators: annotators.map((a, i) => ({
        key: `a${i + 1}`,
        label: blind ? `Annotator ${i + 1}` : a.email,
      })),
      annotations,
      adjudications: getAdjudications(projectId),
    });
  } catch (error) {
    return handle(error);
  }
}

/** Admin only: upsert the ground-truth decision for one task. */
export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = (await request.json()) as { taskId?: number; results?: AnnotationResult[] };
    if (typeof body.taskId !== 'number' || !Array.isArray(body.results)) {
      return NextResponse.json(
        { error: 'taskId (number) and results (array) are required.' },
        { status: 400 },
      );
    }
    const projectId = getTaskProjectId(body.taskId);
    if (projectId == null) {
      return NextResponse.json({ error: 'That case no longer exists.' }, { status: 404 });
    }
    requireVisibleProject(admin, projectId);
    saveAdjudication(body.taskId, admin.id, body.results);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handle(error);
  }
}

/** Admin only: update a project's blind-adjudication setting. */
export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = (await request.json()) as { projectId?: number; blind?: boolean };
    if (typeof body.blind !== 'boolean' || !Number.isInteger(body.projectId)) {
      return NextResponse.json(
        { error: 'projectId (number) and blind (boolean) are required.' },
        { status: 400 },
      );
    }
    requireVisibleProject(admin, body.projectId as number);
    setReviewBlind(body.projectId as number, body.blind);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handle(error);
  }
}
