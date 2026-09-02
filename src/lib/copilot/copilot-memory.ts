import type { CopilotSession } from "./types";

export type CopilotMemorySnapshot = {
  session: CopilotSession | null;
  updatedAt: number;
};

const DB_NAME = "dream-studio-copilot";
const DB_VERSION = 1;
const STORE_NAME = "memory";
const DEFAULT_SNAPSHOT_KEY = "copilot";

const EMPTY_MEMORY: CopilotMemorySnapshot = {
  session: null,
  updatedAt: 0
};

export async function loadCopilotMemory(key = DEFAULT_SNAPSHOT_KEY): Promise<CopilotMemorySnapshot> {
  if (!canUseIndexedDb()) {
    return EMPTY_MEMORY;
  }

  try {
    const db = await openCopilotDb();
    const snapshot = await getValue<CopilotMemorySnapshot>(db, key);
    db.close();
    return snapshot ?? EMPTY_MEMORY;
  } catch {
    return EMPTY_MEMORY;
  }
}

export async function saveCopilotMemory(snapshot: CopilotMemorySnapshot, key = DEFAULT_SNAPSHOT_KEY): Promise<void> {
  if (!canUseIndexedDb()) {
    return;
  }

  try {
    const db = await openCopilotDb();
    await setValue(db, key, {
      ...snapshot,
      updatedAt: Date.now()
    });
    db.close();
  } catch {
    // Copilot memory should never block a run.
  }
}

function canUseIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function openCopilotDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
  });
}

function getValue<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as T | undefined);
  });
}

function setValue(db: IDBDatabase, key: string, value: CopilotMemorySnapshot): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(value, key);

    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });
}
