/**
 * The preview tab's resident view state, declared as the sidebar tab's
 * official store seat. The framework owns one instance per session and hands
 * the body a selector hook plus the baked action set. Components read through
 * the selector and write through those actions.
 *
 * State is bucketed by tab id, so two preview tabs in one session keep their
 * own reading state. A bucket is created on first write and dropped when the tab
 * record's signal aborts. `defineStore`'s immer draft mutators are the
 * complete write set: every action names the tab it writes.
 * @module dsh-typst/client/view-state
 */

import {
  defineStore,
  type EngineStoreHandle,
} from "@deepseek-ai/dsh-client-store";
import type {
  FeedbackDraft,
  ReadingPosition,
  NavigationHistory,
} from "./types.js";

/** The tab record's id as the framework types it on `useTabInfo()`. */
type TabId = string;

export type AuxiliaryView = "outline" | "problems" | "annotations";

/** One tab's resident state, including hide/remount and session switches. */
export interface TabState {
  main: string | null;
  positions: Record<string, ReadingPosition>;
  histories: Record<string, NavigationHistory>;
  auxiliary: AuxiliaryView | null;
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

/** All tabs' state in one session, keyed by the tab record's id. */
export interface PreviewState {
  byTab: Record<TabId, TabState>;
}

/** The store's typed write set; every action takes the tab it acts on. */
export type PreviewActions = {
  forget: (d: PreviewState, tabId: TabId) => void;
  setMain: (d: PreviewState, tabId: TabId, main: string | null) => void;
  setPosition: (
    d: PreviewState,
    tabId: TabId,
    main: string,
    position: ReadingPosition,
  ) => void;
  setHistory: (
    d: PreviewState,
    tabId: TabId,
    main: string,
    history: NavigationHistory,
  ) => void;
  setAuxiliary: (
    d: PreviewState,
    tabId: TabId,
    auxiliary: AuxiliaryView | null,
  ) => void;
  setAuxiliaryHeight: (d: PreviewState, tabId: TabId, height: number) => void;
  setFeedback: (
    d: PreviewState,
    tabId: TabId,
    feedback: FeedbackDraft | null,
  ) => void;
  patchFeedback: (
    d: PreviewState,
    tabId: TabId,
    change: Partial<FeedbackDraft>,
  ) => void;
  setFeedbackExpanded: (d: PreviewState, tabId: TabId, value: boolean) => void;
  setSending: (d: PreviewState, tabId: TabId, value: boolean) => void;
  setFeedbackError: (
    d: PreviewState,
    tabId: TabId,
    value: string | null,
  ) => void;
  setProgress: (d: PreviewState, tabId: TabId, value: string) => void;
  setNotice: (d: PreviewState, tabId: TabId, value: string | null) => void;
  pushRequest: (
    d: PreviewState,
    tabId: TabId,
    request: TabState["requests"][number],
  ) => void;
  dropRequest: (d: PreviewState, tabId: TabId, seq: number) => void;
  markRequestSeen: (d: PreviewState, tabId: TabId, seq: number) => void;
  setOutlineCollapsed: (
    d: PreviewState,
    tabId: TabId,
    main: string,
    ids: string[],
  ) => void;
};

/** Fresh state for one tab occurrence. */
export function initialTabState(): TabState {
  return {
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
}

function bucket(state: PreviewState, tabId: TabId): TabState {
  return (state.byTab[tabId] ??= initialTabState());
}

const tabViewFields = (
  Object.keys(initialTabState()) as (keyof TabState)[]
).filter((key) => key !== "positions");

export function sameTabView(
  a: TabState | undefined,
  b: TabState | undefined,
  main: string,
): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  return (
    tabViewFields.every((key) => a[key] === b[key]) &&
    a.positions[main] === b.positions[main]
  );
}

/**
 * Declare the preview store. The tab registration passes a fresh handle as an
 * exclusive store, so the framework mints and disposes the instance.
 * @returns the store handle to declare on the registration.
 */
export function createPreviewStore(): EngineStoreHandle<
  PreviewState,
  PreviewActions
> {
  return defineStore({
    init: (): PreviewState => ({ byTab: {} }),
    actions: {
      forget: (d, tabId) => {
        const tab = d.byTab[tabId];
        tab?.feedback?.images.forEach((image) =>
          URL.revokeObjectURL(image.url),
        );
        d.byTab = Object.fromEntries(
          Object.entries(d.byTab).filter(([id]) => id !== tabId),
        );
      },
      setMain: (d, tabId, main) => {
        bucket(d, tabId).main = main;
      },
      setPosition: (d, tabId, main, position) => {
        bucket(d, tabId).positions = {
          ...bucket(d, tabId).positions,
          [main]: position,
        };
      },
      setHistory: (d, tabId, main, history) => {
        bucket(d, tabId).histories = {
          ...bucket(d, tabId).histories,
          [main]: history,
        };
      },
      setAuxiliary: (d, tabId, auxiliary) => {
        bucket(d, tabId).auxiliary = auxiliary;
      },
      setAuxiliaryHeight: (d, tabId, height) => {
        bucket(d, tabId).auxiliaryHeight = Math.max(
          0.15,
          Math.min(0.6, height),
        );
      },
      setFeedback: (d, tabId, feedback) => {
        const tab = bucket(d, tabId);
        if (tab.feedback !== null && tab.feedback !== feedback)
          tab.feedback.images.forEach((image) =>
            URL.revokeObjectURL(image.url),
          );
        tab.feedback = feedback;
      },
      patchFeedback: (d, tabId, change) => {
        const tab = bucket(d, tabId);
        if (tab.feedback !== null)
          tab.feedback = { ...tab.feedback, ...change };
      },
      setFeedbackExpanded: (d, tabId, value) => {
        bucket(d, tabId).feedbackExpanded = value;
      },
      setSending: (d, tabId, value) => {
        bucket(d, tabId).sending = value;
      },
      setFeedbackError: (d, tabId, value) => {
        bucket(d, tabId).feedbackError = value;
      },
      setProgress: (d, tabId, value) => {
        bucket(d, tabId).progress = value;
      },
      setNotice: (d, tabId, value) => {
        bucket(d, tabId).notice = value;
      },
      pushRequest: (d, tabId, request) => {
        bucket(d, tabId).requests.push(request);
      },
      dropRequest: (d, tabId, seq) => {
        const tab = bucket(d, tabId);
        tab.requests = tab.requests.filter((item) => item.seq !== seq);
      },
      markRequestSeen: (d, tabId, seq) => {
        bucket(d, tabId).seenRequest = seq;
      },
      setOutlineCollapsed: (d, tabId, main, ids) => {
        bucket(d, tabId).outlineCollapsed = {
          ...bucket(d, tabId).outlineCollapsed,
          [main]: ids,
        };
      },
    },
  });
}

export type PreviewStoreHandle = ReturnType<typeof createPreviewStore>;

export const initialPosition = (): ReadingPosition => ({
  pageIndex: 0,
  x: 0,
  y: 0,
  zoom: { kind: "fit-width" },
  mode: "continuous",
});
