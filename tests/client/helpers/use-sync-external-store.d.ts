/**
 * Local typings for use-sync-external-store: the runtime package ships no
 * types. Mirrors the shim's with-selector build (the only entry the specs
 * consume), matching the harness's own declaration.
 */
declare module "use-sync-external-store/shim/with-selector" {
  export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => Snapshot,
    getServerSnapshot: undefined | null | (() => Snapshot),
    selector: (snapshot: Snapshot) => Selection,
    isEqual?: (a: Selection, b: Selection) => boolean,
  ): Selection;
}
