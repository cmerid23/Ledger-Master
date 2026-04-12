import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "clearledger-offline";
const DB_VERSION = 1;

type OfflineDB = IDBPDatabase<{
  invoices: { key: string; value: { businessId: number; data: unknown; cachedAt: number } };
  jobs:     { key: string; value: { businessId: number; data: unknown; cachedAt: number } };
  transactions: { key: string; value: { businessId: number; data: unknown; cachedAt: number } };
}>;

let _db: OfflineDB | null = null;

async function getDB(): Promise<OfflineDB> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("invoices"))    db.createObjectStore("invoices");
      if (!db.objectStoreNames.contains("jobs"))        db.createObjectStore("jobs");
      if (!db.objectStoreNames.contains("transactions"))db.createObjectStore("transactions");
    },
  }) as OfflineDB;
  return _db;
}

type Store = "invoices" | "jobs" | "transactions";

export async function cacheData(store: Store, businessId: number, data: unknown): Promise<void> {
  try {
    const db = await getDB();
    await db.put(store, { businessId, data, cachedAt: Date.now() }, String(businessId));
  } catch { /* silently ignore — caching is best-effort */ }
}

export async function getCachedData(store: Store, businessId: number): Promise<unknown | null> {
  try {
    const db = await getDB();
    const entry = await db.get(store, String(businessId));
    return entry?.data ?? null;
  } catch {
    return null;
  }
}

export function isOffline(): boolean {
  return !navigator.onLine;
}
