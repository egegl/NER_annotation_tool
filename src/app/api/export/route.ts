import { NextResponse } from 'next/server';
import { HttpError, requireAdmin } from '@/lib/server/auth';
import { gatherExport, getProjectById } from '@/lib/server/repo';
import {
  multiUserCasesToCsv,
  multiUserCasesToTasks,
  type MultiUserCase,
} from '@/lib/io';

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
 * Admin only: export the selected users' annotations. `userIds` chooses which
 * annotators are included; `format` is 'json' (combined Label Studio) or 'csv';
 * `includeGroundTruth` adds each task's adjudicated results as a
 * "ground_truth" annotator entry; `includePatientNote=false` removes the note
 * field (including a mirrored copy under its original source-column name).
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();

    const body = (await request.json()) as {
      projectId?: number;
      userIds?: number[];
      format?: 'json' | 'csv';
      includeGroundTruth?: boolean;
      includePatientNote?: boolean;
    };
    if (!Number.isInteger(body.projectId)) {
      return NextResponse.json({ error: 'A valid projectId is required.' }, { status: 400 });
    }
    const project = getProjectById(body.projectId as number);
    if (!project) {
      return NextResponse.json({ error: 'That project no longer exists.' }, { status: 404 });
    }

    const userIds = Array.isArray(body.userIds) ? body.userIds : [];
    const format = body.format === 'csv' ? 'csv' : 'json';
    const includePatientNote = body.includePatientNote !== false;

    const cases: MultiUserCase[] = gatherExport(project.id, userIds, body.includeGroundTruth === true).map((row) => ({
      ID: row.task.external_id,
      data: JSON.parse(row.task.data_json) as Record<string, string>,
      byUser: row.byUser,
    }));

    const base = project.file_name.replace(/\.(csv|xlsx|xls|json)$/, '') || 'annotations';
    if (format === 'csv') {
      return new NextResponse(multiUserCasesToCsv(cases, includePatientNote), {
        headers: {
          'Content-Type': 'text/csv;charset=utf-8',
          'Content-Disposition': `attachment; filename="annotated_${base}.csv"`,
        },
      });
    }

    const json = JSON.stringify(multiUserCasesToTasks(cases, includePatientNote), null, 2);
    return new NextResponse(json, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="annotated_${base}.json"`,
      },
    });
  } catch (error) {
    return handle(error);
  }
}
