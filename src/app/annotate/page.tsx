
"use client";

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { CaseData, Span, Label } from '@/types';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileUp, FileDown, ChevronLeft, ChevronRight, FileText, UploadCloud, LogOut } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Annotator } from '@/components/app/annotator';
import labelConfig from '@/config/labels.json';
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
import { cn } from '@/lib/utils';
import { generateColor } from '@/lib/color';

interface LabelConfigEntry {
    name: string;
    colorIndex?: number;
}

const CONFIGURED_LABELS: Label[] = (labelConfig.labels as LabelConfigEntry[]).map((label, index) => ({
    name: label.name,
    color: generateColor(label.colorIndex ?? index),
}));


export default function AnnotatePage() {
    const [data, setData] = useState<CaseData[]>([]);
    const [labels, setLabels] = useState<Label[]>(CONFIGURED_LABELS);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [fileName, setFileName] = useState('');
    const { toast } = useToast();
    const dataFileInputRef = useRef<HTMLInputElement>(null);
    const [showRestoreDialog, setShowRestoreDialog] = useState(false);
    const [user, setUser] = useState<string | null>(null);
    const router = useRouter();

    const getSessionKey = (username: string) => `annotator-session-${username}`;

    useEffect(() => {
        try {
            const loggedInUser = localStorage.getItem('annotator-user');
            if (!loggedInUser) {
                router.push('/');
            } else {
                setUser(loggedInUser);
                const savedSession = localStorage.getItem(getSessionKey(loggedInUser));
                if (savedSession) {
                    setShowRestoreDialog(true);
                }
            }
        } catch (error) {
            console.error("Could not read from localStorage", error);
            router.push('/');
        }
    }, [router]);

    useEffect(() => {
        if (user && data.length > 0 && fileName) {
            try {
                const session = { data, currentIndex, fileName };
                localStorage.setItem(getSessionKey(user), JSON.stringify(session));
            } catch (error) {
                console.error("Could not write to localStorage", error);
            }
        }
    }, [data, currentIndex, fileName, user]);

    const handleRestoreSession = (restore: boolean) => {
        setShowRestoreDialog(false);
        if (!user) return;
        try {
            if (restore) {
                const savedSession = localStorage.getItem(getSessionKey(user));
                if (savedSession) {
                    const { data, currentIndex, fileName } = JSON.parse(savedSession);
                    setData(data);
                    setCurrentIndex(currentIndex);
                    setFileName(fileName);
                    setLabels(CONFIGURED_LABELS);
                    toast({
                        title: 'Session Restored',
                        description: 'Your previous session has been loaded.',
                    });
                }
            } else {
                localStorage.removeItem(getSessionKey(user));
                setData([]);
                setLabels(CONFIGURED_LABELS);
                setFileName('');
                setCurrentIndex(0);
            }
        } catch (error) {
            console.error("Could not process session from localStorage", error);
            localStorage.removeItem(getSessionKey(user));
        }
    };

    const handleLogout = () => {
        try {
            localStorage.removeItem('annotator-user');
        } catch (error) {
            console.error("Could not clear localStorage", error);
        }
        router.push('/');
    };

    const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !user) return;

        try {
            localStorage.removeItem(getSessionKey(user));
            setLabels(CONFIGURED_LABELS);
        } catch (error) {
            console.error("Could not clear localStorage", error);
        }

        setFileName(file.name);
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const fileContent = e.target?.result;
                let parsedData: any[] = [];

                if (file.name.endsWith('.csv')) {
                    const result = Papa.parse(fileContent as string, { header: true, skipEmptyLines: true });
                    parsedData = result.data;
                } else {
                    const workbook = XLSX.read(fileContent, { type: 'binary' });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    parsedData = XLSX.utils.sheet_to_json(sheet);
                }

                const formattedData: CaseData[] = parsedData.map((row: any, index: number) => {
                    let rawText = '';
                    if (row.text) {
                        rawText = String(row.text);
                    } else if (row.raw_text) {
                        rawText = String(row.raw_text)
                    }

                    // Normalize line endings and special characters from XLSX
                    const text = rawText
                        .replace(/_x000D_/g, '\n') // Replace XLSX's CR encoding
                        .replace(/\r/g, '');      // Remove any remaining CR characters


                    let spans: Span[] = [];
                    // Check if it's an exported file with a 'labels' column
                    if (row.labels) {
                        try {
                            const parsedSpans = typeof row.labels === 'string' ? JSON.parse(row.labels) : row.labels;
                            if (Array.isArray(parsedSpans)) {
                                // Keep only start, end, and label properties
                                spans = parsedSpans.map(({ start, end, label }) => ({ start, end, label }));
                            }
                        } catch (err) {
                          // ignore if parsing fails, will proceed to keyword parsing
                        }
                    }

                    if (row.keywords && text) {
                        let keywordTuples: [string, string][] = [];
                        try {
                             // This format is tricky. It's a string that looks like a python list of tuples.
                             // '[('label', 'keyword'), ('label', 'keyword')]'
                             // We'll use regex and string manipulation to parse it.
                            let cleanedString = String(row.keywords).trim();
                            if(cleanedString.startsWith('[') && cleanedString.endsWith(']')) {
                                cleanedString = cleanedString.slice(1, -1);
                            }

                            if(cleanedString.length > 0) {
                               const tupleRegex = /\('([^']*)',\s*'([^']*)'\)/g;
                                let match;
                                while ((match = tupleRegex.exec(cleanedString)) !== null) {
                                    keywordTuples.push([match[1], match[2]]);
                                }
                            }

                        } catch(e) {
                             console.error("Could not parse keywords", e);
                        }

                        const newSpans: Span[] = [];
                        
                        keywordTuples.forEach(([label, keyword]) => {
                            if (!CONFIGURED_LABELS.some(l => l.name === label)) {
                                return; // Skip if label is not in the configured list
                            }
                            let startIndex = 0;
                            let indexInText;
                            while ((indexInText = text.indexOf(keyword, startIndex)) > -1) {
                                const start = indexInText;
                                const end = start + keyword.length;
                                newSpans.push({ start, end, label: label });
                                startIndex = end; 
                            }
                        });

                        newSpans.forEach(newSpan => {
                            const isDuplicate = spans.some(existingSpan => 
                                existingSpan.start === newSpan.start &&
                                existingSpan.end === newSpan.end &&
                                existingSpan.label === newSpan.label
                            );
                            if (!isDuplicate) {
                                spans.push(newSpan);
                            }
                        });
                        spans.sort((a,b) => a.start - b.start);
                    }

                    return {
                        ID: row.ID || `case-${index + 1}`,
                        text: text,
                        spans: spans,
                    };
                }).filter(item => item.text.length > 0);

                if (formattedData.length === 0) {
                    throw new Error("No valid data found. Ensure columns 'ID' and 'raw_text' (or 'text') exist.");
                }

                setData(formattedData);
                setCurrentIndex(0);
                toast({
                    title: 'Import Successful',
                    description: `${formattedData.length} cases loaded from ${file.name}.`,
                });
            } catch (error: any) {
                toast({
                    variant: 'destructive',
                    title: 'Import Failed',
                    description: error.message || 'Please check the file format and content.',
                });
                setData([]);
                setLabels(CONFIGURED_LABELS);
                setFileName('');
            } finally {
              if (dataFileInputRef.current) {
                dataFileInputRef.current.value = "";
              }
            }
        };

        reader.onerror = () => {
            toast({
                variant: 'destructive',
                title: 'File Read Error',
                description: 'Could not read the selected file.',
            });
        };

        if (file.name.endsWith('.csv')) {
            reader.readAsText(file);
        } else {
            reader.readAsBinaryString(file);
        }
    };
  
    const handleExport = () => {
        if (!user || data.length === 0) {
            toast({
                variant: "destructive",
                title: "No Data to Export",
                description: "Please import and annotate data before exporting.",
            });
            return;
        }

        const dataToExport = data.map(item => ({
            ID: item.ID,
            text: item.text,
            labels: JSON.stringify(item.spans.map(span => ({
                ...span,
                text: item.text.substring(span.start, span.end)
            }))),
        }));
        
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'annotations');
        
        const originalExtension = fileName.split('.').pop();
        const exportFileName = `annotated_${fileName.replace(/\.(csv|xlsx|xls)$/, '')}.${originalExtension || 'xlsx'}`;

        XLSX.writeFile(workbook, exportFileName);
        toast({
            title: 'Export Successful',
            description: `Data exported to ${exportFileName}. Your session has been cleared.`,
        });

        try {
            localStorage.removeItem(getSessionKey(user));
        } catch (error) {
            console.error("Could not clear localStorage after export", error);
        }
    };
    
    const currentCase = data[currentIndex];

    if (!user) {
        // Still authenticating or redirecting
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <p>Loading...</p>
            </div>
        );
    }
    
    if (!currentCase) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background p-4">
                 <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Restore Previous Session?</AlertDialogTitle>
                            <AlertDialogDescription>
                                It looks like you have a saved session. Would you like to restore it?
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => handleRestoreSession(false)}>Start New</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleRestoreSession(true)}>Restore</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                <Card className="w-full max-w-lg text-center shadow-2xl transition-all hover:shadow-primary/20">
                    <CardHeader>
                        <div className="mx-auto bg-primary/10 p-4 rounded-full w-fit">
                            <FileText className="h-10 w-10 text-primary" />
                        </div>
                        <CardTitle className="mt-4 text-2xl font-bold">Welcome to Annotator Pro</CardTitle>
                        <CardDescription>Start by importing your CSV or Excel file to begin annotating.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col gap-4 items-center">
                            <input type="file" ref={dataFileInputRef} onChange={handleFileImport} className="hidden" accept=".csv,.xlsx,.xls" />
                            <Button size="lg" onClick={() => dataFileInputRef.current?.click()}>
                                <UploadCloud className="mr-2" /> Import Data
                            </Button>
                        </div>
                        <div className="text-left text-sm text-muted-foreground mt-6 space-y-2">
                            <p><strong>How to use this tool:</strong></p>
                            <ul className="list-disc list-inside space-y-1">
                                <li>Import a file (.csv, .xlsx, .xls).</li>
                                <li>The file should have columns: `ID` and `raw_text` (or `text`).</li>
                                <li>Optionally, include a `keywords` column to auto-annotate. Format: `[('label', 'keyword1'), ('label', 'keyword2')]`</li>
                                <li>Select text to apply a label.</li>
                                <li>Click on an existing annotation to remove it.</li>
                                <li>Use the "Next" and "Previous" buttons to navigate.</li>
                                <li>Export your work when you are finished.</li>
                            </ul>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }
    
    const handleCaseUpdate = (updatedCase: CaseData) => {
        const newData = [...data];
        newData[currentIndex] = updatedCase;
        setData(newData);
    };

    const handleNext = () => {
        if (currentIndex < data.length - 1) {
            setCurrentIndex(currentIndex + 1);
        } else {
            toast({
                variant: "default",
                title: "End of Data",
                description: "You have reached the last case.",
            });
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
        } else {
            toast({
                variant: "default",
                title: "Start of Data",
                description: "You are at the first case.",
            });
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col">
            <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Restore Previous Session?</AlertDialogTitle>
                        <AlertDialogDescription>
                            It looks like you have a saved session. Would you like to restore it? Choosing not to restore will start you with the example.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => handleRestoreSession(false)}>Start New</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleRestoreSession(true)}>Restore</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                    <h1 className="text-xl font-bold text-primary">Annotator Pro</h1>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-muted-foreground">Welcome, {user}</span>
                        <input type="file" ref={dataFileInputRef} onChange={handleFileImport} className="hidden" accept=".csv,.xlsx,.xls" />
                        <Button variant="outline" onClick={() => dataFileInputRef.current?.click()}><FileUp className="mr-2" /> Import New File</Button>
                        <Button onClick={handleExport}><FileDown className="mr-2" /> Export Data</Button>
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
                          key={`${currentCase.ID}-${JSON.stringify(labels)}`}
                          caseData={currentCase}
                          onCaseUpdate={handleCaseUpdate}
                          labels={labels}
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
                        <Card className="shadow-lg">
                            <CardHeader>
                                <CardTitle>Labels</CardTitle>
                                <CardDescription>Available labels for annotation.</CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-wrap gap-2">
                                {labels.map(label => (
                                    <Badge key={label.name} variant="outline" className={cn("text-sm", label.color.border, label.color.text, label.color.bg)}>
                                        {label.name}
                                    </Badge>
                                ))}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </main>
        </div>
    );
}
