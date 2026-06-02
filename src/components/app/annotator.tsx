
"use client";
import React, { useState, useRef, useLayoutEffect } from 'react';
import type { CaseData, Span, Label } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";


interface AnnotatorProps {
    caseData: CaseData;
    onCaseUpdate: (updatedCase: CaseData) => void;
    labels: Label[];
}

const getLabelClasses = (labelName: string, labels: Label[]) => {
    const label = labels.find(l => l.name === labelName);
    if (!label) return {bg: '', text: '', border: ''};
    return label.color;
};

const getIndicatorClasses = (labelName: string, labels: Label[]) => {
    const label = labels.find(l => l.name === labelName);
    if (!label) return "";
    return label.color.indicator;
};

interface Selection {
    start: number;
    end: number;
    text: string;
}

export function Annotator({ caseData, onCaseUpdate, labels }: AnnotatorProps) {
    const [selection, setSelection] = useState<Selection | null>(null);
    const [popoverOpen, setPopoverOpen] = useState(false);
    const annotatorRef = useRef<HTMLDivElement>(null);
    const popoverTriggerRef = useRef<HTMLButtonElement>(null);


    const handleMouseUp = (event: React.MouseEvent<HTMLDivElement>) => {
        const currentSelection = window.getSelection();
        if (!currentSelection || currentSelection.isCollapsed || !annotatorRef.current) {
            setPopoverOpen(false);
            return;
        }

        const range = currentSelection.getRangeAt(0);

        if (!annotatorRef.current.contains(range.commonAncestorContainer)) {
             setPopoverOpen(false);
             return;
        }

        const text = range.toString();
        if (text.trim().length > 0) {
            const preSelectionRange = document.createRange();
            preSelectionRange.selectNodeContents(annotatorRef.current);
            preSelectionRange.setEnd(range.startContainer, range.startOffset);
            const start = preSelectionRange.toString().length;
            const end = start + range.toString().length;

            if (start < end) {
                setSelection({ start, end, text });
                
                const trigger = popoverTriggerRef.current;
                if(trigger) {
                    const rect = range.getBoundingClientRect();
                    const annotatorRect = annotatorRef.current.getBoundingClientRect();
                    trigger.style.position = 'absolute';
                    trigger.style.top = `${rect.bottom - annotatorRect.top + 5}px`;
                    trigger.style.left = `${rect.left - annotatorRect.left}px`;
                    setPopoverOpen(true);
                }
            }
        } else {
            setPopoverOpen(false);
        }
    };

    const handleLabelSelect = (label: string) => {
        if (!selection) return;

        const newSpan: Span = {
            start: selection.start,
            end: selection.end,
            label,
        };
        
        const newSpans = caseData.spans.filter(
            (span) => span.end <= selection.start || span.start >= selection.end
        );

        onCaseUpdate({
            ...caseData,
            spans: [...newSpans, newSpan].sort((a, b) => a.start - b.start),
        });

        setPopoverOpen(false);
        setSelection(null);
        window.getSelection()?.removeAllRanges();
    };

    const handleRemoveSpan = (spanToRemove: Span) => {
         onCaseUpdate({
            ...caseData,
            spans: caseData.spans.filter(span => span !== spanToRemove)
        });
    }

    const renderAnnotatedText = () => {
        let lastIndex = 0;
        const parts: (JSX.Element | string)[] = [];
        const sortedSpans = [...caseData.spans].sort((a, b) => a.start - b.start);

        sortedSpans.forEach((span, i) => {
            if (span.start < lastIndex || span.end < span.start || span.end > caseData.text.length) {
                return;
            }

            if (span.start > lastIndex) {
                parts.push(caseData.text.substring(lastIndex, span.start));
            }
            
            const colorClasses = getLabelClasses(span.label, labels);

            parts.push(
                <span
                    key={`${span.start}-${span.end}`}
                    data-annotation="true"
                    onClick={(e) => {
                        e.stopPropagation(); 
                        handleRemoveSpan(span);
                    }}
                    className={cn(
                        "p-0.5 rounded-sm mx-px cursor-pointer border",
                        colorClasses.bg, colorClasses.text, colorClasses.border
                    )}
                >
                    {caseData.text.substring(span.start, span.end)}
                </span>
            );
            lastIndex = span.end;
        });

        if (lastIndex < caseData.text.length) {
            parts.push(caseData.text.substring(lastIndex));
        }

        return parts;
    };
    
    return (
        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle>Annotate Text</CardTitle>
                <CardDescription>Select text to apply a label. Click a labeled span to remove it.</CardDescription>
            </CardHeader>
            <CardContent className="relative">
                <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                    <PopoverTrigger asChild>
                         <button ref={popoverTriggerRef} className="opacity-0 w-0 h-0 p-0 m-0" />
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-1" side="top" align="start">
                        <div className="flex flex-col gap-1">
                            {labels.map((label) => (
                                <Button
                                    key={label.name}
                                    variant="ghost"
                                    size="sm"
                                    className="justify-start w-full"
                                    onMouseDown={(e) => e.preventDefault()} 
                                    onClick={() => handleLabelSelect(label.name)}
                                >
                                    <span className={cn("w-3 h-3 rounded-full mr-2 shrink-0", getIndicatorClasses(label.name, labels))} />
                                    {label.name}
                                </Button>
                            ))}
                        </div>
                    </PopoverContent>
                </Popover>
                 <div ref={annotatorRef} onMouseUp={handleMouseUp} className="text-lg leading-relaxed p-4 border rounded-md min-h-[200px] w-full" style={{whiteSpace: 'pre-wrap'}}>
                    {renderAnnotatedText()}
                </div>
            </CardContent>
        </Card>
    );
}
