export interface Span {
  start: number;
  end: number;
  label: string;
}

export interface CaseData {
  ID: string;
  text: string;
  spans: Span[];
}

export interface LabelColor {
  bg: string;
  text: string;
  border: string;
  indicator: string;
}

export interface Label {
  name: string;
  color: LabelColor;
}
