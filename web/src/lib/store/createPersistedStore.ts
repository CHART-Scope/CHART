import { create, type StateCreator } from "zustand";
import {
  createJSONStorage,
  persist,
  type PersistOptions,
  type StateStorage,
} from "zustand/middleware";

type StorageChoice = "local" | "session";

export type CreatePersistedStoreOptions<T, S = T> = Omit<
  PersistOptions<T, S>,
  "storage"
> & {
  storage?: StorageChoice;
};

const memoryStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

function resolveStorage(choice: StorageChoice): StateStorage {
  if (typeof window === "undefined") return memoryStorage;
  return choice === "session" ? window.sessionStorage : window.localStorage;
}

export function createPersistedStore<T, S = T>(
  initializer: StateCreator<T>,
  options: CreatePersistedStoreOptions<T, S>,
) {
  const { storage = "local", ...rest } = options;
  return create<T>()(
    persist(initializer, {
      ...rest,
      storage: createJSONStorage<S>(() => resolveStorage(storage)),
    }),
  );
}
