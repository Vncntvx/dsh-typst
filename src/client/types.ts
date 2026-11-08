import type {
  SourceMatch,
  SnapshotView,
  PreviewIdentity,
} from "../contract.js";
import type { Dict } from "./locales.js";

export type Translate = (key: keyof Dict) => string;
export type Zoom =
  { kind: "fit-width" | "fit-page" } | { kind: "fixed"; percent: number };
export interface ReadingPosition {
  pageIndex: number;
  x: number;
  y: number;
  zoom: Zoom;
  mode: "continuous" | "single";
}
export interface NavigationHistory {
  items: ReadingPosition[];
  index: number;
}
export interface RegionImage {
  id: string;
  page: number;
  rect: number[];
  blob: Blob;
  url: string;
  width: number;
  height: number;
  identity: PreviewIdentity;
  main: string;
}
export interface FeedbackDraft {
  id: string;
  title: string;
  question: string;
  context: string;
  snapshot: SnapshotView | null;
  images: RegionImage[];
  text?: string;
  matches?: SourceMatch[];
  source?: SourceMatch | null;
  diagnostics?: { generation: number; run: number; main: string | null };
}
export function identityKey(identity: PreviewIdentity): string {
  return `${identity.generation}:${identity.seq}:${identity.sha256}`;
}
export function errorText(error: unknown): string {
  return error instanceof Error ||
    (typeof error === "object" && error !== null && "message" in error)
    ? String(error.message)
    : String(error);
}
