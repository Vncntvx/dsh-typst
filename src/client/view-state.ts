import { useSyncExternalStore } from "react";
import type {
  FeedbackDraft,
  ReadingPosition,
  NavigationHistory,
} from "./types.js";

export interface TabState {
  main: string | null;
  positions: Record<string, ReadingPosition>;
  histories: Record<string, NavigationHistory>;
  auxiliary: "outline" | "problems" | "annotations" | null;
  auxiliaryHeight: number;
  feedback: FeedbackDraft | null;
  feedbackExpanded: boolean;
  sending: boolean;
  feedbackError: string | null;
  progress: string;
  notice: string | null;
  requests: {
    seq: number;
    view: NonNullable<import("../contract.js").PanelView>;
  }[];
  seenRequest: number;
  outlineCollapsed: Record<string, string[]>;
}
/** Resident state follows the tab record, including hide/remount and session switches. */
export class PreviewViewStore {
  private value: TabState = {
    main: null,
    positions: {},
    histories: {},
    auxiliary: null,
    auxiliaryHeight: 0.3,
    feedback: null,
    feedbackExpanded: true,
    sending: false,
    feedbackError: null,
    progress: "",
    notice: null,
    requests: [],
    seenRequest: 0,
    outlineCollapsed: {},
  };
  private listeners = new Set<() => void>();
  getSnapshot = (): TabState => this.value;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  update(change: Partial<TabState>): void {
    this.value = { ...this.value, ...change };
    for (const listener of this.listeners) listener();
  }
  dispose(): void {
    this.value.feedback?.images.forEach((image) =>
      URL.revokeObjectURL(image.url),
    );
    this.listeners.clear();
  }
}
export function useViewStore(store: PreviewViewStore): TabState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
export const initialPosition = (): ReadingPosition => ({
  pageIndex: 0,
  x: 0,
  y: 0,
  zoom: { kind: "fit-width" },
  mode: "continuous",
});

/** Tab signals outlive React visibility; cleanup belongs to the record, not the body. */
export class PreviewViewRegistry {
  private stores = new Map<string, PreviewViewStore>();
  for(sessionId: string, tabId: string, signal: AbortSignal): PreviewViewStore {
    const key = `${sessionId}:${tabId}`;
    let store = this.stores.get(key);
    if (!store) {
      store = new PreviewViewStore();
      this.stores.set(key, store);
      const owned = store;
      signal.addEventListener(
        "abort",
        () => {
          owned.dispose();
          if (this.stores.get(key) === owned) this.stores.delete(key);
        },
        { once: true },
      );
    }
    return store;
  }
  dispose(): void {
    for (const store of this.stores.values()) store.dispose();
    this.stores.clear();
  }
}
