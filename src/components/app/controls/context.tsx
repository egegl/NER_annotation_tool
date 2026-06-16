"use client";

import React, { createContext, useContext, useMemo, useState } from 'react';
import type {
  AnnotationResult,
  CaseData,
  ControlTag,
  ParsedConfig,
  RegionResult,
  RegionValue,
  RelationResult,
} from '@/types';
import { isRegion, isRelation } from '@/types';

export const genId = () => Math.random().toString(36).slice(2, 10);

const controlResultType = (c: ControlTag): RegionResult['type'] => {
  switch (c.type) {
    case 'Labels':
      return 'labels';
    case 'Choices':
      return 'choices';
    case 'TextArea':
      return 'textarea';
    case 'Rating':
      return 'rating';
    default:
      return 'labels';
  }
};

export const isEmptyValue = (value: RegionValue): boolean => {
  if (value.choices) return value.choices.length === 0;
  if (value.text !== undefined) {
    const arr = Array.isArray(value.text) ? value.text : [value.text];
    return arr.every((t) => !String(t).trim());
  }
  if (value.rating !== undefined) return !value.rating;
  return true;
};

interface AnnotatorCtx {
  config: ParsedConfig;
  caseData: CaseData;
  /** True in the admin config preview: hides annotator-only tools (search etc.). */
  previewMode: boolean;
  regions: RegionResult[];
  relations: RelationResult[];
  // span label arming
  armed: { control: string; value: string } | null;
  setArmed: (a: { control: string; value: string } | null) => void;
  // relation label arming
  armedRelation: string | null;
  setArmedRelation: (v: string | null) => void;
  // selection + relation linking
  selectedRegionId: string | null;
  setSelectedRegionId: (id: string | null) => void;
  relationFrom: string | null;
  setRelationFrom: (id: string | null) => void;
  // mutations
  spanRegionsFor: (objectName: string) => RegionResult[];
  applyLabel: (control: ControlTag, start: number, end: number, text: string, value: string) => void;
  removeRegion: (id: string) => void;
  getDocResult: (controlName: string) => RegionResult | undefined;
  setDocResult: (control: ControlTag, value: RegionValue) => void;
  getPerRegionResult: (controlName: string, regionId: string) => RegionResult | undefined;
  setPerRegionResult: (control: ControlTag, regionId: string, value: RegionValue) => void;
  addRelation: (fromId: string, toId: string, label: string | null) => void;
  removeRelation: (rel: RelationResult) => void;
  flipRelation: (rel: RelationResult) => void;
}

const Ctx = createContext<AnnotatorCtx | null>(null);

export const useAnnotator = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAnnotator must be used within AnnotatorProvider');
  return ctx;
};

interface ProviderProps {
  config: ParsedConfig;
  caseData: CaseData;
  onChange: (results: AnnotationResult[]) => void;
  previewMode?: boolean;
  children: React.ReactNode;
}

export function AnnotatorProvider({ config, caseData, onChange, previewMode = false, children }: ProviderProps) {
  const [armed, setArmed] = useState<{ control: string; value: string } | null>(null);
  const [armedRelation, setArmedRelation] = useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [relationFrom, setRelationFrom] = useState<string | null>(null);

  const results = caseData.results;
  const regions = useMemo(() => results.filter(isRegion), [results]);
  const relations = useMemo(() => results.filter(isRelation), [results]);

  const commit = (next: AnnotationResult[]) => onChange(next);

  const value = useMemo<AnnotatorCtx>(() => {
    const spanRegionsFor = (objectName: string) =>
      regions.filter((r) => r.type === 'labels' && r.to_name === objectName);

    const applyLabel = (
      control: ControlTag,
      start: number,
      end: number,
      text: string,
      labelValue: string,
    ) => {
      const region: RegionResult = {
        id: genId(),
        from_name: control.name,
        to_name: control.toName ?? '',
        type: 'labels',
        value: { start, end, text, labels: [labelValue] },
      };
      commit([...results, region]);
      setSelectedRegionId(region.id);
    };

    const removeRegion = (id: string) => {
      commit(
        results.filter((r) =>
          isRelation(r) ? r.from_id !== id && r.to_id !== id : r.id !== id,
        ),
      );
      setSelectedRegionId((cur) => (cur === id ? null : cur));
      setRelationFrom((cur) => (cur === id ? null : cur));
    };

    const getDocResult = (controlName: string) =>
      regions.find((r) => r.from_name === controlName);

    const setDocResult = (control: ControlTag, val: RegionValue) => {
      const existing = getDocResult(control.name);
      const rest = results.filter(
        (r) => !(isRegion(r) && r.from_name === control.name),
      );
      if (isEmptyValue(val)) {
        commit(rest);
        return;
      }
      const region: RegionResult = {
        id: existing?.id ?? genId(),
        from_name: control.name,
        to_name: control.toName ?? '',
        type: controlResultType(control),
        value: val,
      };
      commit([...rest, region]);
    };

    const getPerRegionResult = (controlName: string, regionId: string) =>
      regions.find((r) => r.from_name === controlName && r.id === regionId);

    const setPerRegionResult = (control: ControlTag, regionId: string, val: RegionValue) => {
      const rest = results.filter(
        (r) => !(isRegion(r) && r.from_name === control.name && r.id === regionId),
      );
      if (isEmptyValue(val)) {
        commit(rest);
        return;
      }
      const region: RegionResult = {
        id: regionId,
        from_name: control.name,
        to_name: control.toName ?? '',
        type: controlResultType(control),
        value: val,
      };
      commit([...rest, region]);
    };

    const addRelation = (fromId: string, toId: string, label: string | null) => {
      if (fromId === toId) return;
      const rel: RelationResult = {
        type: 'relation',
        from_id: fromId,
        to_id: toId,
        direction: 'right',
        ...(label ? { labels: [label] } : {}),
      };
      commit([...results, rel]);
    };

    const removeRelation = (rel: RelationResult) => {
      commit(results.filter((r) => r !== rel));
    };

    const flipRelation = (rel: RelationResult) => {
      commit(
        results.map((r) =>
          r === rel
            ? { ...rel, from_id: rel.to_id, to_id: rel.from_id }
            : r,
        ),
      );
    };

    return {
      config,
      caseData,
      previewMode,
      regions,
      relations,
      armed,
      setArmed,
      armedRelation,
      setArmedRelation,
      selectedRegionId,
      setSelectedRegionId,
      relationFrom,
      setRelationFrom,
      spanRegionsFor,
      applyLabel,
      removeRegion,
      getDocResult,
      setDocResult,
      getPerRegionResult,
      setPerRegionResult,
      addRelation,
      removeRelation,
      flipRelation,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, caseData, previewMode, results, regions, relations, armed, armedRelation, selectedRegionId, relationFrom]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
