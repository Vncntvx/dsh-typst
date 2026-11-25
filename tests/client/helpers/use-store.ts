/**
 * Test-side synthesis of the framework's selector hook. `ui-renderer` binds
 * `useSyncExternalStoreWithSelector` against its store instance at the slot
 * binding site; specs that render a component directly need the same shape.
 * The hook itself closes over the instance, so it can be constructed outside
 * a component just like the framework's cached binding-site hook.
 * @module tests/client/helpers/use-store
 */

import { useSyncExternalStoreWithSelector } from "use-sync-external-store/shim/with-selector";
import type { SnapshotSelectorHook } from "@deepseek-ai/dsh-client-store";

/** Bind a selector hook to one bare store instance. */
export function hookOf<T>(instance: {
  subscribe(fn: () => void): () => void;
  getSnapshot(): T;
}): SnapshotSelectorHook<T> {
  const subscribe = instance.subscribe.bind(instance);
  const getSnapshot = instance.getSnapshot.bind(instance);
  return <S>(selector: (state: T) => S, isEqual?: (a: S, b: S) => boolean): S =>
    useSyncExternalStoreWithSelector(
      subscribe,
      getSnapshot,
      undefined,
      selector,
      isEqual,
    );
}
