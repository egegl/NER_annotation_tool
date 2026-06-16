
"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { AnnotationResult, CaseData } from '@/types';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileUp, FileDown, ChevronLeft, ChevronRight, FileText, UploadCloud, LogOut, Settings2, Check, UserPlus } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Annotator } from '@/components/app/annotator';
import { ProjectSettingsDialog } from '@/components/app/ProjectSettingsDialog';
import { AdminCreateAccountDialog } from '@/components/app/AdminCreateAccountDialog';
import { ExportDialog } from '@/components/app/ExportDialog';
import { SelectTextColumnDialog } from '@/components/app/SelectTextColumnDialog';
import { parseLabelConfig } from '@/lib/labelConfig';
import {
    rowsToCases,
    tasksToCases,
    columnsOf,
    columnSamples,
    guessTextColumn,
} from '@/lib/io';
import type { LSTask } from '@/lib/io';
import { cn } from '@/lib/utils';
import defaultLabeling from '@/config/labeling.json';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const DEFAULT_XML = (defaultLabeling as { xml: string }).xml;

type Role = 'admin' | 'annotator';

export default function AnnotatePage() {
    const [data, setData] = useState<CaseData[]>([]);
    const [taskIds, setTaskIds] = useState<number[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [fileName, setFileName] = useState('');
    const [configXml, setConfigXml] = useState<string>(DEFAULT_XML);
    const [projectExists, setProjectExists] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [createAccountOpen, setCreateAccountOpen] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);
    const [showSaved, setShowSaved] = useState(false);
    const savedTimer = useRef<ReturnType<typeof setTimeout>>();
    const saveTimer = useRef<ReturnType<typeof setTimeout>>();
    const { toast } = useToast();
    const dataFileInputRef = useRef<HTMLInputElement>(null);
    const [user, setUser] = useState<string | null>(null);
    const [role, setRole] = useState<Role>('annotator');
    const [loading, setLoading] = useState(true);
    const [pendingUpload, setPendingUpload] = useState<{ cases: CaseData[]; fileName: string } | null>(null);
    // Parsed-but-not-yet-mapped import, awaiting the admin's text-column choice.
    const [pendingImport, setPendingImport] = useState<
        | {
              fileName: string;
              columns: string[];
              samples: Record<string, string>;
              defaultColumn?: string;
              build: (textColumn: string) => CaseData[];
          }
        | null
    >(null);
    const router = useRouter();

    const isAdmin = role === 'admin';
    const parsedConfig = useMemo(() => parseLabelConfig(configXml), [configXml]);

    /** Load the shared project + this user's own annotations into the UI. */
    const loadProject = useCallback(async () => {
        const [projectRes, annRes] = await Promise.all([
            fetch('/api/project'),
            fetch('/api/annotations'),
        ]);
        const projectData = await projectRes.json();
        const annData = await annRes.json();

        if (!projectData.project) {
            setProjectExists(false);
            setData([]);
            setTaskIds([]);
            setFileName('');
            return;
        }

        const annotations: Record<number, AnnotationResult[]> = annData.annotations ?? {};
        const tasks: { id: number; ID: string; data: Record<string, string> }[] = projectData.tasks ?? [];

        setProjectExists(true);
        setConfigXml(projectData.project.configXml);
        setFileName(projectData.project.fileName);
        setTaskIds(tasks.map((t) => t.id));
        setData(tasks.map((t) => ({ ID: t.ID, data: t.data, results: annotations[t.id] ?? [] })));
        setCurrentIndex(0);
    }, []);

    // On mount: confirm the session, then load the project + annotations.
    useEffect(() => {
        (async () => {
            try {
                const meRes = await fetch('/api/auth/me');
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
        clearTimeout(saveTimer.current);
    }, []);

    const flashSaved = () => {
        setShowSaved(true);
        clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setShowSaved(false), 2000);
    };

    /** Persist one task's results for the current user (server keys it by session). */
    const saveAnnotation = useCallback(async (taskId: number, results: AnnotationResult[]) => {
        try {
            const res = await fetch('/api/annotations', {
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
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => saveAnnotation(taskId, results), 500);
    };

    const handleLogout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
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
                const res = await fetch('/api/project', {
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
                let build: (textColumn: string) => CaseData[];

                if (file.name.endsWith('.json')) {
                    const parsed = JSON.parse(fileContent as string);
                    const tasks: LSTask[] = Array.isArray(parsed) ? parsed : [parsed];
                    rowsForColumns = tasks.map((t) => t.data ?? {});
                    build = (textColumn) => tasksToCases(tasks, textColumn);
                } else if (file.name.endsWith('.csv')) {
                    const result = Papa.parse(fileContent as string, { header: true, skipEmptyLines: true });
                    const rows = result.data as Record<string, unknown>[];
                    rowsForColumns = rows;
                    build = (textColumn) => rowsToCases(rows, textColumn);
                } else {
                    const workbook = XLSX.read(fileContent, { type: 'binary' });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];
                    rowsForColumns = rows;
                    build = (textColumn) => rowsToCases(rows, textColumn);
                }

                const columns = columnsOf(rowsForColumns);
                if (columns.length === 0) {
                    throw new Error('No columns found. Please check the file format and content.');
                }

                setPendingImport({
                    fileName: file.name,
                    columns,
                    samples: columnSamples(rowsForColumns),
                    defaultColumn: guessTextColumn(columns),
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

    /** Build cases from the chosen text column, then upload (or confirm replace). */
    const handleTextColumnChosen = (textColumn: string) => {
        if (!pendingImport) return;
        const { fileName: name, build } = pendingImport;
        setPendingImport(null);

        const cases = build(textColumn);
        if (cases.length === 0) {
            toast({
                variant: 'destructive',
                title: 'Import Failed',
                description: `Column "${textColumn}" is empty for every row. Pick a different column.`,
            });
            return;
        }

        if (projectExists) {
            // Replacing wipes everyone's annotations — confirm first.
            setPendingUpload({ cases, fileName: name });
        } else {
            void uploadProject(cases, name);
        }
    };

    /** Admin: push the parsed project to the server (shared with all annotators). */
    const uploadProject = async (cases: CaseData[], name: string) => {
        try {
            const res = await fetch('/api/project', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName: name, configXml, cases }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error ?? 'Upload failed.');
            await loadProject();
            toast({ title: 'Project Uploaded', description: `${result.count} cases are now shared with all annotators.` });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Upload Failed', description: error instanceof Error ? error.message : undefined });
        }
    };

    const handleNext = () => {
        if (currentIndex < data.length - 1) setCurrentIndex(currentIndex + 1);
        else toast({ title: "End of Data", description: "You have reached the last case." });
    };

    const handlePrev = () => {
        if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
        else toast({ title: "Start of Data", description: "You are at the first case." });
    };

    const currentCase = data[currentIndex];

    const replaceDialog = (
        <AlertDialog open={!!pendingUpload} onOpenChange={(o) => { if (!o) setPendingUpload(null); }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Replace the current project?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Uploading <strong>{pendingUpload?.fileName}</strong> replaces the existing
                        project and permanently deletes <strong>every annotator&apos;s</strong>{' '}
                        annotations. This cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setPendingUpload(null)}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => {
                            if (pendingUpload) void uploadProject(pendingUpload.cases, pendingUpload.fileName);
                            setPendingUpload(null);
                        }}
                    >
                        Replace project
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );

    const textColumnDialog = pendingImport ? (
        <SelectTextColumnDialog
            open={!!pendingImport}
            onOpenChange={(o) => { if (!o) setPendingImport(null); }}
            columns={pendingImport.columns}
            samples={pendingImport.samples}
            defaultColumn={pendingImport.defaultColumn}
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

    const createAccountDialog = isAdmin ? (
        <AdminCreateAccountDialog open={createAccountOpen} onOpenChange={setCreateAccountOpen} />
    ) : null;

    const exportDialog = isAdmin ? (
        <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
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
            <div className="flex items-center justify-center min-h-screen bg-background p-4">
                {textColumnDialog}
                {settingsDialog}
                {createAccountDialog}
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
                                <Button variant="outline" onClick={() => setCreateAccountOpen(true)}>
                                    <UserPlus className="mr-2" /> Create Account
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
            {createAccountDialog}
            {exportDialog}
            <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                    <h1 className="text-xl font-bold text-primary">BMI Annotation Tool</h1>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">Welcome, {user}</span>
                        <input type="file" ref={dataFileInputRef} onChange={handleFileImport} className="hidden" accept=".csv,.xlsx,.xls,.json" />
                        <Button variant="outline" onClick={() => setSettingsOpen(true)}>
                            <Settings2 className="mr-2" /> {isAdmin ? 'Labeling Setup' : 'View Interface'}
                        </Button>
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
                            <Button variant="outline" onClick={() => setCreateAccountOpen(true)}>
                                <UserPlus className="mr-2" /> Create Account
                            </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Log out">
                            <LogOut />
                        </Button>
                    </div>
                </div>
            </header>

            <main className="flex-1 container mx-auto p-4 md:p-6 lg:p-8">
                <div className="grid gap-8 md:grid-cols-3">
                    <div className="md:col-span-2 flex flex-col gap-6">
                        <Annotator
                            key={`${currentCase.ID}-${configXml}`}
                            caseData={currentCase}
                            config={parsedConfig}
                            onChange={handleResultsChange}
                        />
                    </div>

                    <div className="md:col-span-1 flex flex-col gap-6">
                        <Card className="shadow-lg">
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <CardTitle>Navigation & Info</CardTitle>
                                    <Badge variant="secondary">{`Case ${currentIndex + 1} / ${data.length}`}</Badge>
                                </div>
                                <div className="space-y-1 text-sm text-muted-foreground">
                                    <p className="truncate">File: {fileName}</p>
                                    <p className="truncate">ID: {currentCase.ID}</p>
                                </div>
                            </CardHeader>
                            <CardContent className="flex justify-between items-center">
                                <Button variant="outline" onClick={handlePrev} disabled={currentIndex === 0}>
                                    <ChevronLeft className="mr-2" /> Previous
                                </Button>
                                <Button variant="default" onClick={handleNext} disabled={currentIndex === data.length - 1} className="bg-primary hover:bg-primary/90">
                                    Next <ChevronRight className="ml-2" />
                                </Button>
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
