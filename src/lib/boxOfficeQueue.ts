// Tiny IndexedDB-backed offline queue for door scans.
// We keep this dependency-free to stay fast on cheap door phones.

const DB_NAME = "box_office_queue";
const STORE = "scans";
const VERSION = 1;

export interface QueuedScan {
  id: string; // client_event_id
  scannedId: string;
  stationLabel: string;
  pin: string;
  dayKey: string;
  queuedAt: number;
  attempts: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueScan(scan: QueuedScan): Promise<void> {
  const db = await open();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(scan);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function listQueue(): Promise<QueuedScan[]> {
  const db = await open();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => res(req.result as QueuedScan[]);
    req.onerror = () => rej(req.error);
  });
}

export async function removeFromQueue(id: string): Promise<void> {
  const db = await open();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function bumpAttempts(id: string): Promise<void> {
  const db = await open();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const get = store.get(id);
    get.onsuccess = () => {
      const row = get.result as QueuedScan | undefined;
      if (row) {
        row.attempts = (row.attempts || 0) + 1;
        store.put(row);
      }
    };
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
