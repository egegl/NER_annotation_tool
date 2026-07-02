import { NextResponse } from 'next/server';
import type { AnnotationResult } from '@/types';
import { HttpError, requireAdmin } from '@/lib/server/auth';
import {
  gatherReview,
  getAdjudications,
  getProject,
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
 * Admin only: everything the review stream needs — every annotator's results per
 * task, the adjudicated ground truth, and the review settings. With blind
 * adjudication on, annotator identities are masked SERVER-SIDE: the payload
 * carries stable positional keys ("a1", "a2", ordered by user id) and
 * "Annotator N" labels, never emails.
 */
export async function GET() {
  try {
    await requireAdmin();
    const project = getProject();
    if (!project) {
      return NextResponse.json({ error: 'No project to review yet.' }, { status: 400 });
    }
    const blind = project.review_blind !== 0;

    const { annotators, byTask } = gatherReview();
    const keyByUserId = new Map(annotators.map((a, i) => [a.userId, `a${i + 1}`]));
    const annotations: Record<number, Record<string, AnnotationResult[]>> = {};
    for (const [taskId, perUser] of byTask) {
      const masked: Record<string, AnnotationResult[]> = {};
      for (const [userId, results] of perUser) {
        masked[keyByUserId.get(userId)!] = results;
      }
      annotations[taskId] = masked;
    }

    return NextResponse.json({
      settings: { blind },
      annotators: annotators.map((a, i) => ({
        key: `a${i + 1}`,
        label: blind ? `Annotator ${i + 1}` : a.email,
      })),
      annotations,
      adjudications: getAdjudications(),
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
    saveAdjudication(body.taskId, admin.id, body.results);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handle(error);
  }
}

/** Admin only: update the blind-adjudication setting. */
export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as { blind?: boolean };
    if (typeof body.blind !== 'boolean') {
      return NextResponse.json({ error: 'blind (boolean) is required.' }, { status: 400 });
    }
    setReviewBlind(body.blind);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handle(error);
  }
}
