export type OutboxItem = {
  id: string;
  type: "photo" | "message";
  jobId: string;
  createdAt: string;
  filename?: string;
  mime?: string;
  tagId?: string | null;
  note?: string | null;
  takenAt?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  gpsAccuracy?: number | null;
  body?: string;
  blob?: Blob;
  lastError?: string;
  sendingAt?: number;
};

const DB_NAME = "excel-jobs";
const STORE = "outbox";

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>) {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    Promise.resolve(fn(store))
      .then((result) => {
        if (result && typeof (result as IDBRequest).onsuccess === "object") {
          const request = result as IDBRequest<T>;
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        } else {
          tx.oncomplete = () => resolve(result as T);
          tx.onerror = () => reject(tx.error);
        }
      })
      .catch(reject);
  });
}

export async function listOutbox() {
  const db = await openDb();
  return new Promise<OutboxItem[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as OutboxItem[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    request.onerror = () => reject(request.error);
  });
}

export async function enqueue(item: OutboxItem) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  window.dispatchEvent(new Event("excel-outbox"));
  if (navigator.serviceWorker?.ready) {
    const reg = await navigator.serviceWorker.ready;
    const sync = (reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync;
    await sync?.register("excel-outbox").catch(() => undefined);
  }
}

export async function removeOutbox(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  window.dispatchEvent(new Event("excel-outbox"));
}

async function mark(item: OutboxItem) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function flushOutbox() {
  const items = await listOutbox();
  let sent = 0;
  let auth = false;
  for (const item of items) {
    if (item.sendingAt && Date.now() - item.sendingAt < 60_000) continue;
    await mark({ ...item, sendingAt: Date.now() });
    try {
      const response = await sendItem(item);
      if (response.status === 401) {
        auth = true;
        await mark({ ...item, sendingAt: undefined, lastError: "auth" });
        break;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        await mark({ ...item, sendingAt: undefined, lastError: data.error || "bad" });
        continue;
      }
      await removeOutbox(item.id);
      sent += 1;
    } catch {
      await mark({ ...item, sendingAt: undefined, lastError: "network" });
      break;
    }
  }
  window.dispatchEvent(new Event("excel-outbox"));
  const left = (await listOutbox()).length;
  return { sent, left, auth };
}

async function sendItem(item: OutboxItem) {
  if (item.type === "message") {
    return fetch(`/api/jobs/${item.jobId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-excel-json": "1" },
      body: JSON.stringify({ body: item.body || "", clientId: item.id }),
    });
  }
  const form = new FormData();
  form.set("file", item.blob || new Blob(), item.filename || "photo.jpg");
  form.set("kind", "photo");
  form.set("tagId", item.tagId || "");
  form.set("note", item.note || "");
  form.set("takenAt", item.takenAt || item.createdAt);
  form.set("clientId", item.id);
  if (item.latitude != null) form.set("latitude", String(item.latitude));
  if (item.longitude != null) form.set("longitude", String(item.longitude));
  if (item.gpsAccuracy != null) form.set("gpsAccuracy", String(item.gpsAccuracy));
  return fetch(`/api/jobs/${item.jobId}/files`, { method: "POST", headers: { "x-excel-json": "1" }, body: form });
}

void withStore;
