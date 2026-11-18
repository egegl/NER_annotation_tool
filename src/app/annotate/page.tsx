
"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { AnnotationResult, CaseData } from '@/types';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { FileUp, FileDown, ChevronLeft, ChevronRight, FileText, UploadCloud, LogOut, Settings2, Check, Users, SkipForward, ClipboardCheck, Layers } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Annotator } from '@/components/app/annotator';
import { ProjectSettingsDialog } from '@/components/app/ProjectSettingsDialog';
import { ReplaceProjectDialog } from '@/components/app/ReplaceProjectDialog';
import { ManageProjectsDialog } from '@/components/app/ManageProjectsDialog';
import { AccessSettingsDialog } from '@/components/app/AccessSettingsDialog';
import { AccountMenu } from '@/components/app/AccountMenu';
import { ExportDialog } from '@/components/app/ExportDialog';
import { SelectTextColumnDialog } from '@/components/app/SelectTextColumnDialog';
import { ReviewSettingsDialog } from '@/components/app/ReviewSettingsDialog';
import { ReviewWorkspace } from '@/components/app/review/ReviewWorkspace';
import {
    agreementStats,
    caseReviewStatus,
    STATUS_COLORS,
    type CaseReviewStatus,
    type ReviewData,
} from '@/lib/review';
import { parseLabelConfig, isCaseAnnotated } from '@/lib/labelConfig';
import {
    rowsToCases,
    tasksToCases,
    columnsOf,
    columnSamples,
    guessTextColumn,
    guessIdColumn,
} from '@/lib/io';
import type { LSTask } from '@/lib/io';
import { cn } from '@/lib/utils';
import { api } from '@/lib/basePath';
import defaultLabeling from '@/config/labeling.json';

const DEFAULT_XML = (defaultLabeling as { xml: string }).xml;

type Role = 'admin' | 'annotator';

export default function AnnotatePage() {
    const [data, setData] = useState<CaseData[]>([]);
    const [taskIds, setTaskIds] = useState<number[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [fileName, setFileName] = useState('');
    const [configXml, setConfigXml] = useState<string>(DEFAULT_XML);
    // Admin-set always-highlight keywords, shared with all annotators.
    const [keywords, setKeywords] = useState('');
    const [projectExists, setProjectExists] = useState(false);
    // The admin's own assigned project id (drives selector defaults).
    const [myProjectId, setMyProjectId] = useState<number | null>(null);
    // While in Reviewer Mode, the project being reviewed (may differ from myProjectId).
    const [reviewProjectId, setReviewProjectId] = useState<number | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [accessSettingsOpen, setAccessSettingsOpen] = useState(false);
    const [manageProjectsOpen, setManageProjectsOpen] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);
    // Reviewer Mode (admin adjudication of annotator conflicts).
    const [reviewMode, setReviewMode] = useState(false);
    const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
    const [reviewData, setReviewData] = useState<ReviewData | null>(null);
    const [conflictsOnly, setConflictsOnly] = useState(true);
    const [showSaved, setShowSaved] = useState(false);
    const savedTimer = useRef<ReturnType<typeof setTimeout>>();
    // Debounced saves, one timer per task: moving to the next case must not
    // cancel a save that is still waiting for the case just left.
    const saveTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
    const gtSaveTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
    const { toast } = useToast();
    const dataFileInputRef = useRef<HTMLInputElement>(null);
    const [user, setUser] = useState<string | null>(null);
    const [role, setRole] = useState<Role>('annotator');
    const [loading, setLoading] = useState(true);
    const [pendingUpload, setPendingUpload] = useState<{ cases: CaseData[]; fileName: string; keywords: string } | null>(null);
    const [jumpValue, setJumpValue] = useState('');
    // Parsed-but-not-yet-mapped import, awaiting the admin's text-column choice.
    const [pendingImport, setPendingImport] = useState<
        | {
              fileName: string;
              columns: string[];
              samples: Record<string, string>;
              defaultColumn?: string;
              defaultIdColumn?: string;
              build: (textColumn: string, idColumn: string) => CaseData[];
          }
        | null
    >(null);
    const router = useRouter();

    const isAdmin = role === 'admin';
    const parsedConfig = useMemo(() => parseLabelConfig(configXml), [configXml]);

    /** Load the shared project + this user's own annotations into the UI. */
    const loadProject = useCallback(async () => {
        const [projectRes, annRes] = await Promise.all([
            fetch(api('/api/project')),
            fetch(api('/api/annotations')),
        ]);
        const projectData = await projectRes.json();
        const annData = await annRes.json();

        if (!projectData.project) {
            setProjectExists(false);
            setMyProjectId(null);
            setData([]);
            setTaskIds([]);
            setFileName('');
            return;
        }

        const annotations: Record<number, AnnotationResult[]> = annData.annotations ?? {};
        const tasks: { id: number; ID: string; data: Record<string, string> }[] = projectData.tasks ?? [];

        setProjectExists(true);
        setMyProjectId(projectData.project.id ?? null);
        setConfigXml(projectData.project.configXml);
        setKeywords(projectData.project.keywords ?? '');
        setFileName(projectData.project.fileName);
        setTaskIds(tasks.map((t) => t.id));
        setData(tasks.map((t) => ({ ID: t.ID, data: t.data, results: annotations[t.id] ?? [] })));
        setCurrentIndex(0);
    }, []);

    // On mount: confirm the session, then load the project + annotations.
    useEffect(() => {
        (async () => {
            try {
                const meRes = await fetch(api('/api/auth/me'));
                if (!meRes.ok) {
                    router.push('/');
                    return;
                }
                const me = await meRes.json();
                setUser(me.email);
                setRole(me.role === 'admin' ? 'admin' : 'annotator');
                await loadProject();
            } catch (error) {
                console.error('Could not load session', error);
                router.push('/');
            } finally {
                setLoading(false);
            }
        })();
    }, [router, loadProject]);

    useEffect(() => () => {
        clearTimeout(savedTimer.current);
        saveTimers.current.forEach((t) => clearTimeout(t));
        gtSaveTimers.current.forEach((t) => clearTimeout(t));
    }, []);

    const flashSaved = () => {
        setShowSaved(true);
        clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setShowSaved(false), 2000);
    };

    /** Persist one task's results for the current user (server keys it by session). */
    const saveAnnotation = useCallback(async (taskId: number, results: AnnotationResult[]) => {
        try {
            const res = await fetch(api('/api/annotations'), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId, results }),
            });
            if (res.ok) flashSaved();
        } catch (error) {
            console.error('Could not save annotation', error);
        }
    }, []);

    const handleResultsChange = (results: AnnotationResult[]) => {
        setData((prev) => prev.map((c, i) => (i === currentIndex ? { ...c, results } : c)));
        const taskId = taskIds[currentIndex];
        if (taskId == null) return;
        clearTimeout(saveTimers.current.get(taskId));
        saveTimers.current.set(taskId, setTimeout(() => {
            saveTimers.current.delete(taskId);
            saveAnnotation(taskId, results);
        }, 500));
    };

    /** Admin: load one project's review stream: its config + tasks plus every
     * annotator's results + adjudications (identities masked server-side when
     * blind adjudication is on). Switches the workspace to that project. */
    const loadReviewProject = useCallback(async (projectId: number): Promise<ReviewData> => {
        const res = await fetch(api(`/api/review?projectId=${projectId}`));
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? 'Could not load review data.');

        const tasks: { id: number; ID: string; data: Record<string, string> }[] = payload.tasks ?? [];
        setConfigXml(payload.project.configXml);
        setFileName(payload.project.fileName);
        setTaskIds(tasks.map((t) => t.id));
        setData(tasks.map((t) => ({ ID: t.ID, data: t.data, results: [] })));
        setReviewData(payload as ReviewData);
        setReviewProjectId(projectId);
        return payload as ReviewData;
    }, []);

    /** Persist one task's ground-truth decision. */
    const saveAdjudication = useCallback(async (taskId: number, results: AnnotationResult[]) => {
        try {
            const res = await fetch(api('/api/review'), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId, results }),
            });
            if (res.ok) flashSaved();
        } catch (error) {
            console.error('Could not save adjudication', error);
        }
    }, []);

    const handleGroundTruthChange = (results: AnnotationResult[]) => {
        const taskId = taskIds[currentIndex];
        if (taskId == null) return;
        setReviewData((prev) =>
            prev ? { ...prev, adjudications: { ...prev.adjudications, [taskId]: results } } : prev,
        );
        clearTimeout(gtSaveTimers.current.get(taskId));
        gtSaveTimers.current.set(taskId, setTimeout(() => {
            gtSaveTimers.current.delete(taskId);
            saveAdjudication(taskId, results);
        }, 500));
    };

    /** Save the blind setting for the chosen project, load its review stream, and
     * enter Reviewer Mode. Rethrows so the settings dialog stays open on failure. */
    const handleReviewConfirm = async (blind: boolean, projectId: number) => {
        try {
            const res = await fetch(api('/api/review'), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, blind }),
            });
            if (!res.ok) throw new Error((await res.json()).error ?? 'Could not save review settings.');
            const fresh = await loadReviewProject(projectId);
            setReviewMode(true);
            // Start the review stream at the first conflict awaiting a decision.
            const freshConfig = parseLabelConfig(fresh.project?.configXml ?? configXml);
            const freshTaskIds = (fresh.tasks ?? []).map((t) => t.id);
            const firstConflict = freshTaskIds.findIndex(
                (tid) => caseReviewStatus(freshConfig, fresh.annotations[tid], fresh.adjudications[tid]) === 'conflict',
            );
            setCurrentIndex(firstConflict >= 0 ? firstConflict : 0);
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Reviewer Mode',
                description: error instanceof Error ? error.message : 'Please try again.',
            });
            throw error;
        }
    };

    /** Leave Reviewer Mode and restore the admin's own assigned project. */
    const handleReviewExit = () => {
        setReviewMode(false);
        setReviewProjectId(null);
        void loadProject();
    };

    const reviewBlind = reviewData?.settings.blind ?? true;

    const handleLogout = async () => {
        try {
            await fetch(api('/api/auth/logout'), { method: 'POST' });
        } catch (error) {
            console.error('Could not log out', error);
        }
        router.push('/');
    };

    /** Admin: save the shared labeling config. Before the project exists this just
     * stages the config locally; it is sent with the first upload. */
    const handleSaveConfig = async (xml: string) => {
        setConfigXml(xml);
        if (projectExists) {
            try {
                const res = await fetch(api('/api/project'), {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ configXml: xml }),
                });
                if (!res.ok) throw new Error((await res.json()).error ?? 'Save failed.');
            } catch (error) {
                toast({ variant: 'destructive', title: 'Could not save config', description: error instanceof Error ? error.message : undefined });
                return;
            }
        }
        toast({ title: 'Labeling Setup Saved', description: 'The shared annotation interface has been updated.' });
    };

    /** Parse an imported file (client-side), detect its columns, then ask the
     * admin which column holds the main text before building cases. */
    const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const fileContent = e.target?.result;
                // Per-format: the rows to inspect for columns, and a builder that
                // turns the parsed source into cases given the chosen text column.
                let rowsForColumns: Record<string, unknown>[];
                let build: (textColumn: string, idColumn: string) => CaseData[];

                if (file.name.endsWith('.json')) {
                    const parsed = JSON.parse(fileContent as string);
                    const tasks: LSTask[] = Array.isArray(parsed) ? parsed : [parsed];
                    rowsForColumns = tasks.map((t) => t.data ?? {});
                    build = (textColumn, idColumn) => tasksToCases(tasks, textColumn, idColumn);
                } else if (file.name.endsWith('.csv')) {
                    const result = Papa.parse(fileContent as string, { header: true, skipEmptyLines: true });
                    const rows = result.data as Record<string, unknown>[];
                    rowsForColumns = rows;
                    build = (textColumn, idColumn) => rowsToCases(rows, textColumn, idColumn);
                } else {
                    const workbook = XLSX.read(fileContent, { type: 'binary' });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];
                    rowsForColumns = rows;
                    build = (textColumn, idColumn) => rowsToCases(rows, textColumn, idColumn);
                }

                const columns = columnsOf(rowsForColumns);
                if (columns.length === 0) {
                    throw new Error('No columns found. Please check the file format and content.');
                }

                const samples = columnSamples(rowsForColumns);
                setPendingImport({
                    fileName: file.name,
                    columns,
                    samples,
                    defaultColumn: guessTextColumn(columns, samples),
                    defaultIdColumn: guessIdColumn(columns),
                    build,
                });
            } catch (error: any) {
                toast({ variant: 'destructive', title: 'Import Failed', description: error.message || 'Please check the file format and content.' });
            } finally {
                if (dataFileInputRef.current) dataFileInputRef.current.value = "";
            }
        };
        reader.onerror = () => {
            toast({ variant: 'destructive', title: 'File Read Error', description: 'Could not read the selected file.' });
        };

        if (file.name.endsWith('.csv') || file.name.endsWith('.json')) reader.readAsText(file);
        else reader.readAsBinaryString(file);
    };

    /** Build cases from the chosen text + ID columns, then upload (or confirm replace).
     * `adminKeywords` is the optional always-highlight keyword list (file contents). */
    const handleTextColumnChosen = (textColumn: string, idColumn: string, adminKeywords: string) => {
        if (!pendingImport) return;
        const { fileName: name, build } = pendingImport;
        setPendingImport(null);

        const cases = build(textColumn, idColumn);
        if (cases.length === 0 || cases.every((c) => (c.data.text ?? '').length === 0)) {
            toast({
                variant: 'destructive',
                title: 'Import Failed',
                description: `Column "${textColumn}" is empty for every row. Pick a different column.`,
            });
            return;
        }

        // Choosing which accounts get this new file happens in the picker next.
        setPendingUpload({ cases, fileName: name, keywords: adminKeywords });
    };

    /** Admin: create a new project from the parsed file and assign the chosen
     * accounts to it. Accounts left off keep their current project. */
    const uploadProject = async (
        cases: CaseData[],
        name: string,
        adminKeywords: string,
        assignUserIds: number[],
    ) => {
        try {
            const res = await fetch(api('/api/project'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName: name, configXml, keywords: adminKeywords, cases, assignUserIds }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error ?? 'Upload failed.');
            // Reflects in the admin's own view only if they assigned themselves.
            await loadProject();
            const n = result.assigned ?? assignUserIds.length;
            toast({
                title: 'Project Uploaded',
                description: `${result.count} cases uploaded and assigned to ${n} account${n === 1 ? '' : 's'}.`,
            });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Upload Failed', description: error instanceof Error ? error.message : undefined });
        }
    };

    /** Review status per case (parallel to data/taskIds); empty outside Reviewer Mode. */
    const caseStatuses = useMemo<CaseReviewStatus[]>(() => {
        if (!reviewMode || !reviewData || !parsedConfig.valid) return [];
        return taskIds.map((tid) =>
            caseReviewStatus(parsedConfig, reviewData.annotations[tid], reviewData.adjudications[tid]),
        );
    }, [reviewMode, reviewData, taskIds, parsedConfig]);

    const reviewStats = useMemo(() => agreementStats(caseStatuses), [caseStatuses]);

    /** The indices Prev/Next move through: all cases, or only conflicted ones
     * when the Reviewer Mode filter is on. */
    const visibleIndices = useMemo(() => {
        const all = data.map((_, i) => i);
        if (!reviewMode || !conflictsOnly) return all;
        return all.filter((i) => caseStatuses[i] === 'conflict' || caseStatuses[i] === 'resolved');
    }, [data, reviewMode, conflictsOnly, caseStatuses]);

    const hasPrevVisible = visibleIndices.some((i) => i < currentIndex);
    const hasNextVisible = visibleIndices.some((i) => i > currentIndex);

    const handleNext = () => {
        const next = visibleIndices.find((i) => i > currentIndex);
        if (next != null) setCurrentIndex(next);
    };

    const handlePrev = () => {
        const prev = [...visibleIndices].reverse().find((i) => i < currentIndex);
        if (prev != null) setCurrentIndex(prev);
    };

    /** Move to the next conflict still awaiting a ground-truth decision, wrapping. */
    const handleNextConflict = () => {
        const n = data.length;
        for (let step = 1; step <= n; step++) {
            const idx = (currentIndex + step) % n;
            if (caseStatuses[idx] === 'conflict') {
                setCurrentIndex(idx);
                return;
            }
        }
        toast({ title: 'No pending conflicts', description: 'Every conflicted case has been adjudicated.' });
    };

    const isAnnotated = useCallback(
        (c: CaseData) => isCaseAnnotated(parsedConfig, c),
        [parsedConfig],
    );
    const annotatedCount = useMemo(() => data.filter(isAnnotated).length, [data, isAnnotated]);

    /** Jump to the case number typed in the input (1-based). */
    const handleJump = () => {
        const n = parseInt(jumpValue, 10);
        if (Number.isNaN(n) || n < 1 || n > data.length) {
            toast({ variant: 'destructive', title: 'Invalid case number', description: `Enter a number between 1 and ${data.length}.` });
            return;
        }
        setCurrentIndex(n - 1);
        setJumpValue('');
    };

    /** Move to the next case without any annotations, wrapping around. */
    const handleNextUnannotated = () => {
        const n = data.length;
        for (let step = 1; step <= n; step++) {
            const idx = (currentIndex + step) % n;
            if (!isAnnotated(data[idx])) {
                setCurrentIndex(idx);
                return;
            }
        }
        toast({ title: 'All cases annotated', description: 'Every case has at least one annotation.' });
    };

    const currentCase = data[currentIndex];

    const replaceDialog = pendingUpload ? (
        <ReplaceProjectDialog
            open={!!pendingUpload}
            onOpenChange={(o) => { if (!o) setPendingUpload(null); }}
            fileName={pendingUpload.fileName}
            caseCount={pendingUpload.cases.length}
            currentEmail={user}
            onConfirm={async (assignUserIds) => {
                await uploadProject(pendingUpload.cases, pendingUpload.fileName, pendingUpload.keywords, assignUserIds);
                setPendingUpload(null);
            }}
        />
    ) : null;

    const textColumnDialog = pendingImport ? (
        <SelectTextColumnDialog
            open={!!pendingImport}
            onOpenChange={(o) => { if (!o) setPendingImport(null); }}
            columns={pendingImport.columns}
            samples={pendingImport.samples}
            defaultColumn={pendingImport.defaultColumn}
            defaultIdColumn={pendingImport.defaultIdColumn}
            fileName={pendingImport.fileName}
            onConfirm={handleTextColumnChosen}
        />
    ) : null;

    const settingsDialog = (
        <ProjectSettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            currentXml={configXml}
            onSave={handleSaveConfig}
            previewCase={currentCase}
            readOnly={!isAdmin}
        />
    );

    const accessSettingsDialog = isAdmin ? (
        <AccessSettingsDialog
            open={accessSettingsOpen}
            onOpenChange={setAccessSettingsOpen}
            currentEmail={user}
        />
    ) : null;

    const exportDialog = isAdmin ? (
        <ExportDialog open={exportOpen} onOpenChange={setExportOpen} defaultProjectId={myProjectId} />
    ) : null;

    const manageProjectsDialog = isAdmin ? (
        <ManageProjectsDialog
            open={manageProjectsOpen}
            onOpenChange={setManageProjectsOpen}
            currentProjectId={myProjectId}
            onDeleted={() => {
                // If the project being reviewed was deleted, leave Reviewer Mode.
                if (reviewMode && reviewProjectId != null) handleReviewExit();
            }}
        />
    ) : null;

    const reviewSettingsDialog = isAdmin ? (
        <ReviewSettingsDialog
            open={reviewDialogOpen}
            onOpenChange={setReviewDialogOpen}
            active={reviewMode}
            blind={reviewBlind}
            defaultProjectId={reviewProjectId ?? myProjectId}
            onConfirm={handleReviewConfirm}
            onExit={handleReviewExit}
        />
    ) : null;

    if (loading || !user) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <p>Loading...</p>
            </div>
        );
    }

    // No project yet: admins can upload one; annotators wait.
    if (!currentCase) {
        return (
            <div className="relative flex items-center justify-center min-h-screen bg-background p-4">
                <div className="absolute right-4 top-3">
                    <AccountMenu email={user} role={role} onLogout={handleLogout} />
                </div>
                {textColumnDialog}
                {replaceDialog}
                {settingsDialog}
                {accessSettingsDialog}
                {manageProjectsDialog}
                <Card className="w-full max-w-lg text-center shadow-2xl transition-all hover:shadow-primary/20">
                    <CardHeader>
                        <div className="mx-auto bg-primary/10 p-4 rounded-full w-fit">
                            <FileText className="h-10 w-10 text-primary" />
                        </div>
                        <CardTitle className="mt-4 text-2xl font-bold">BMI Annotation Tool</CardTitle>
                        <CardDescription>
                            {isAdmin
                                ? 'Configure the labeling setup, then upload a project to share with all annotators.'
                                : 'No project has been set up yet. Please check back once an admin uploads one.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isAdmin ? (
                            <div className="flex flex-col gap-3 items-center">
                                <input type="file" ref={dataFileInputRef} onChange={handleFileImport} className="hidden" accept=".csv,.xlsx,.xls,.json" />
                                <Button size="lg" onClick={() => dataFileInputRef.current?.click()}>
                                    <UploadCloud className="mr-2" /> Upload Project
                                </Button>
                                <Button variant="outline" onClick={() => setSettingsOpen(true)}>
                                    <Settings2 className="mr-2" /> Labeling Setup
                                </Button>
                                <Button variant="outline" onClick={() => setManageProjectsOpen(true)}>
                                    <Layers className="mr-2" /> Projects
                                </Button>
                                <Button variant="outline" onClick={() => setAccessSettingsOpen(true)}>
                                    <Users className="mr-2" /> Access Settings
                                </Button>
                            </div>
                        ) : (
                            <Button variant="ghost" onClick={handleLogout}>
                                <LogOut className="mr-2" /> Log out
                            </Button>
                        )}
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col">
            {textColumnDialog}
            {replaceDialog}
            {settingsDialog}
            {accessSettingsDialog}
            {manageProjectsDialog}
            {exportDialog}
            {reviewSettingsDialog}
            <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b">
                <div className="mx-auto w-full max-w-[1800px] px-4 h-14 flex items-center justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                        <h1 className="truncate text-xl font-bold text-primary">BMI Annotation Tool</h1>
                        {isAdmin && (
                            <Button
                                size="sm"
                                variant={reviewMode ? 'default' : 'outline'}
                                className={cn(reviewMode && 'bg-amber-600 text-white hover:bg-amber-700')}
                                aria-pressed={reviewMode}
                                onClick={() => setReviewDialogOpen(true)}
                            >
                                <ClipboardCheck className="mr-1.5 h-4 w-4" /> Reviewer Mode
                            </Button>
                        )}
                        {reviewMode && (
                            <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">
                                {reviewBlind ? 'Blind' : 'Identities shown'}
                            </Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <input type="file" ref={dataFileInputRef} onChange={handleFileImport} className="hidden" accept=".csv,.xlsx,.xls,.json" />
                        {isAdmin && (
                            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
                                <Settings2 className="mr-2" /> Labeling Setup
                            </Button>
                        )}
                        {isAdmin && (
                            <Button variant="outline" onClick={() => dataFileInputRef.current?.click()}>
                                <FileUp className="mr-2" /> Replace Project
                            </Button>
                        )}
                        {isAdmin && (
                            <Button onClick={() => setExportOpen(true)}>
                                <FileDown className="mr-2" /> Export
                            </Button>
                        )}
                        {isAdmin && (
                            <Button variant="outline" onClick={() => setManageProjectsOpen(true)}>
                                <Layers className="mr-2" /> Projects
                            </Button>
                        )}
                        {isAdmin && (
                            <Button variant="outline" onClick={() => setAccessSettingsOpen(true)}>
                                <Users className="mr-2" /> Access Settings
                            </Button>
                        )}
                        <AccountMenu email={user} role={role} onLogout={handleLogout} />
                    </div>
                </div>
            </header>

            <main className="flex-1 mx-auto w-full max-w-[1800px] p-3 lg:p-4">
                <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    <div className="md:col-span-2 lg:col-span-3 xl:col-span-4 flex flex-col gap-4">
                        {reviewMode && reviewData ? (
                            <ReviewWorkspace
                                key={`${currentCase.ID}-${configXml}-review`}
                                caseData={currentCase}
                                config={parsedConfig}
                                annotators={reviewData.annotators}
                                annotationsByKey={reviewData.annotations[taskIds[currentIndex]] ?? {}}
                                groundTruth={reviewData.adjudications[taskIds[currentIndex]] ?? []}
                                onGroundTruthChange={handleGroundTruthChange}
                            />
                        ) : (
                            <Annotator
                                key={`${currentCase.ID}-${configXml}`}
                                caseData={currentCase}
                                config={parsedConfig}
                                adminKeywords={keywords}
                                onChange={handleResultsChange}
                                nav={{ next: handleNext, prev: handlePrev, nextUnannotated: handleNextUnannotated }}
                            />
                        )}
                    </div>

                    <div className="md:col-span-1 flex flex-col gap-4 md:sticky md:top-16 md:self-start">
                        <Card className="shadow-lg">
                            <CardHeader className="p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <CardTitle className="truncate text-lg">Navigation</CardTitle>
                                    <Badge variant="secondary" className="shrink-0">{`Case ${currentIndex + 1} / ${data.length}`}</Badge>
                                </div>
                                <div className="space-y-1 text-sm text-muted-foreground">
                                    <p className="truncate">File: {fileName}</p>
                                    <p className="truncate">ID: {currentCase.ID}</p>
                                </div>
                            </CardHeader>
                            <CardContent className="p-3 pt-0 flex flex-col gap-3">
                                {reviewMode && (
                                    <div className="flex rounded-md border p-0.5">
                                        <Button
                                            type="button"
                                            variant={conflictsOnly ? 'ghost' : 'secondary'}
                                            size="sm"
                                            className="h-7 flex-1"
                                            onClick={() => setConflictsOnly(false)}
                                        >
                                            Show all cases
                                        </Button>
                                        <Button
                                            type="button"
                                            variant={conflictsOnly ? 'secondary' : 'ghost'}
                                            size="sm"
                                            className="h-7 flex-1"
                                            onClick={() => setConflictsOnly(true)}
                                        >
                                            Conflicts only
                                        </Button>
                                    </div>
                                )}
                                {reviewMode ? (
                                    <>
                                        <div className="space-y-1.5">
                                            <div className="flex justify-between text-sm text-muted-foreground">
                                                <span>Conflicts resolved</span>
                                                <span className="tabular-nums">
                                                    {reviewStats.resolved} / {reviewStats.conflicts + reviewStats.resolved}
                                                </span>
                                            </div>
                                            <Progress
                                                value={
                                                    reviewStats.conflicts + reviewStats.resolved > 0
                                                        ? (reviewStats.resolved / (reviewStats.conflicts + reviewStats.resolved)) * 100
                                                        : 0
                                                }
                                                className="h-2"
                                            />
                                        </div>
                                        <div className="space-y-1 rounded-md border p-2">
                                            <div className="flex justify-between gap-2 text-sm">
                                                <span>Inter-annotator agreement</span>
                                                <span className="font-medium tabular-nums">
                                                    {reviewStats.agreement == null ? '—' : `${Math.round(reviewStats.agreement * 100)}%`}
                                                </span>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                {reviewStats.agreed} agreed · {reviewStats.conflicts + reviewStats.resolved} conflicts
                                                {data.length - reviewStats.compared > 0 &&
                                                    ` · ${data.length - reviewStats.compared} not double-annotated`}
                                            </p>
                                        </div>
                                    </>
                                ) : (
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between text-sm text-muted-foreground">
                                            <span>Annotated</span>
                                            <span className="tabular-nums">{annotatedCount} / {data.length}</span>
                                        </div>
                                        <Progress value={data.length ? (annotatedCount / data.length) * 100 : 0} className="h-2" />
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <Button variant="outline" className="flex-1 min-w-0" onClick={handlePrev} disabled={!hasPrevVisible}>
                                        <ChevronLeft className="mr-1 h-4 w-4 shrink-0" /> Prev
                                    </Button>
                                    <Button variant="default" className="flex-1 min-w-0 bg-primary hover:bg-primary/90" onClick={handleNext} disabled={!hasNextVisible}>
                                        Next <ChevronRight className="ml-1 h-4 w-4 shrink-0" />
                                    </Button>
                                </div>
                                {reviewMode ? (
                                    <Button variant="outline" className="w-full" onClick={handleNextConflict} disabled={reviewStats.conflicts === 0}>
                                        <SkipForward className="mr-2 h-4 w-4 shrink-0" /> Next unresolved conflict
                                    </Button>
                                ) : (
                                    <Button variant="outline" className="w-full" onClick={handleNextUnannotated} disabled={annotatedCount === data.length}>
                                        <SkipForward className="mr-2 h-4 w-4 shrink-0" /> Next unannotated
                                    </Button>
                                )}
                                {reviewMode ? (
                                    <div className="space-y-1.5">
                                        <span className="text-sm text-muted-foreground">Go to case</span>
                                        {visibleIndices.length === 0 ? (
                                            <p className="text-xs text-muted-foreground">No conflicted cases yet.</p>
                                        ) : (
                                            <div className="grid max-h-44 grid-cols-5 gap-1 overflow-auto pr-1">
                                                {visibleIndices.map((i) => (
                                                    <button
                                                        key={i}
                                                        type="button"
                                                        onClick={() => setCurrentIndex(i)}
                                                        aria-label={`Go to case ${i + 1}`}
                                                        className={cn(
                                                            'flex h-7 items-center justify-center gap-1 rounded border text-xs tabular-nums hover:bg-muted',
                                                            i === currentIndex && 'ring-2 ring-primary',
                                                        )}
                                                    >
                                                        <span
                                                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                                                            style={{ backgroundColor: STATUS_COLORS[caseStatuses[i] ?? 'unannotated'] }}
                                                        />
                                                        {i + 1}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                            <span className="inline-flex items-center gap-1">
                                                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS.agreed }} />
                                                Agreed / resolved
                                            </span>
                                            <span className="inline-flex items-center gap-1">
                                                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS.conflict }} />
                                                Conflict pending
                                            </span>
                                            <span className="inline-flex items-center gap-1">
                                                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS.unannotated }} />
                                                Unannotated
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <form
                                        className="flex gap-2"
                                        onSubmit={(e) => { e.preventDefault(); handleJump(); }}
                                    >
                                        <Input
                                            type="number"
                                            min={1}
                                            max={data.length}
                                            value={jumpValue}
                                            onChange={(e) => setJumpValue(e.target.value)}
                                            placeholder={`Go to case (1–${data.length})`}
                                            className="h-9"
                                            aria-label="Jump to case number"
                                        />
                                        <Button type="submit" variant="outline" className="h-9 shrink-0" disabled={!jumpValue}>
                                            Go
                                        </Button>
                                    </form>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </main>

            <div
                className={cn(
                    'fixed bottom-4 right-4 z-20 flex items-center gap-1.5 rounded-full border bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur transition-opacity duration-300',
                    showSaved ? 'opacity-100' : 'opacity-0'
                )}
                aria-live="polite"
            >
                <Check className="h-3.5 w-3.5 text-green-600" /> Saved
            </div>
        </div>
    );
}
