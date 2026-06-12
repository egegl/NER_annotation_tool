import { NextResponse } from 'next/server';
import type { CaseData } from '@/types';
import { HttpError, requireAdmin, requireUser } from '@/lib/server/auth';
import { getProject, getTasks, replaceProject, updateConfig } from '@/lib/server/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handle = (error: unknown) => {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : 'Unexpected error.';
  return NextResponse.json({ error: message }, { status: 400 });
};

/** Any logged-in user: the shared project — unannotated tasks + labeling config. */
export async function GET() {
  try {
    await requireUser();
    const project = getProject();
    if (!project) return NextResponse.json({ project: null });

    const tasks = getTasks().map((t) => ({
      id: t.id,
      ID: t.external_id,
      data: JSON.parse(t.data_json) as Record<string, string>,
    }));
    return NextResponse.json({
      project: { fileName: project.file_name, configXml: project.config_xml },
      tasks,
    });
  } catch (error) {
    return handle(error);
  }
}

/** Admin only: replace the project (wipes all tasks + annotations). */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = (await request.json()) as {
      fileName?: string;
      configXml?: string;
      cases?: CaseData[];
    };
    if (!body.fileName || !body.configXml || !Array.isArray(body.cases) || body.cases.length === 0) {
      return NextResponse.json(
        { error: 'fileName, configXml and a non-empty cases array are required.' },
        { status: 400 },
      );
    }
    // Strip any imported annotations so every annotator starts from scratch.
    const cases = body.cases.map((c) => ({ ID: c.ID, data: c.data, results: [] }));
    replaceProject(body.fileName, body.configXml, cases, admin.email);
    return NextResponse.json({ ok: true, count: cases.length });
  } catch (error) {
    return handle(error);
  }
}

/** Admin only: update the shared labeling config (keeps tasks + annotations). */
export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as { configXml?: string };
    if (!body.configXml) {
      return NextResponse.json({ error: 'configXml is required.' }, { status: 400 });
    }
    updateConfig(body.configXml);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handle(error);
  }
}
