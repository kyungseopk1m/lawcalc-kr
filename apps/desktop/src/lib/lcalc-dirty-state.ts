import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

export type LcalcDocumentKey = "interest" | "inheritance" | "litigation-cost";

type Listener = () => void;

const dirtyByDocument = new Map<LcalcDocumentKey, boolean>();
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return [...dirtyByDocument.values()].some(Boolean);
}

export function createLcalcDirtySnapshot(value: unknown): string {
  return JSON.stringify(value);
}

export function setLcalcDocumentDirty(key: LcalcDocumentKey, dirty: boolean): void {
  if (dirtyByDocument.get(key) === dirty) {
    return;
  }
  dirtyByDocument.set(key, dirty);
  emit();
}

export function useHasUnsavedLcalcChanges(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useLcalcDirtyTracker(key: LcalcDocumentKey, snapshot: string) {
  const cleanSnapshotRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      setLcalcDocumentDirty(key, false);
    },
    [key],
  );

  useEffect(() => {
    if (cleanSnapshotRef.current === null) {
      cleanSnapshotRef.current = snapshot;
      setLcalcDocumentDirty(key, false);
      return;
    }

    setLcalcDocumentDirty(key, snapshot !== cleanSnapshotRef.current);
  }, [key, snapshot]);

  return useCallback(
    (cleanSnapshot = snapshot) => {
      cleanSnapshotRef.current = cleanSnapshot;
      setLcalcDocumentDirty(key, false);
    },
    [key, snapshot],
  );
}
