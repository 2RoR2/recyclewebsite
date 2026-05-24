const viteEnv = import.meta.env || {};
const nodeEnv = globalThis.process?.env || {};

const syncedCollections = [
  "users",
  "bins",
  "rewards",
  "records",
  "transactions",
  "redeemed",
  "feedback",
  "learningRecords",
];

const firebaseConfig = {
  apiKey: viteEnv.VITE_FIREBASE_API_KEY || nodeEnv.VITE_FIREBASE_API_KEY,
  projectId: viteEnv.VITE_FIREBASE_PROJECT_ID || nodeEnv.VITE_FIREBASE_PROJECT_ID,
  databaseId: viteEnv.VITE_FIRESTORE_DATABASE_ID || nodeEnv.VITE_FIRESTORE_DATABASE_ID || "(default)",
};

let syncTimer = null;
let lastSyncedPayload = "";
let lastError = "";
let firebaseDisabled = false;

export const isFirebaseConfigured = () =>
  Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

export const firebaseStatus = () => ({
  enabled: isFirebaseConfigured() && !firebaseDisabled,
  lastError,
});

const isPermissionError = (error) =>
  /403|permission_denied|missing or insufficient permissions/i.test(error?.message || "");

const firestoreBaseUrl = () =>
  `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}` +
  `/databases/${encodeURIComponent(firebaseConfig.databaseId)}/documents`;

const documentId = (item) => encodeURIComponent(String(item.id));

const documentPath = (collectionName, id) =>
  `${firestoreBaseUrl()}/${collectionName}/${documentId({ id })}?key=${encodeURIComponent(firebaseConfig.apiKey)}`;

const collectionPath = (collectionName) =>
  `${firestoreBaseUrl()}/${collectionName}?key=${encodeURIComponent(firebaseConfig.apiKey)}`;

const toFirestoreValue = (value) => {
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };

  switch (typeof value) {
    case "string":
      return { stringValue: value };
    case "boolean":
      return { booleanValue: value };
    case "number":
      return Number.isInteger(value)
        ? { integerValue: String(value) }
        : { doubleValue: value };
    case "object":
      return { mapValue: { fields: toFirestoreFields(value) } };
    default:
      return { nullValue: null };
  }
};

const toFirestoreFields = (data) =>
  Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, toFirestoreValue(value)])
  );

const fromFirestoreValue = (value) => {
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ("mapValue" in value) return fromFirestoreFields(value.mapValue.fields || {});
  return null;
};

const fromFirestoreFields = (fields) =>
  Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)])
  );

const cleanForFirebase = (item) =>
  Object.fromEntries(
    Object.entries(item).filter(([, value]) => value !== undefined)
  );

const loadCollection = async (collectionName) => {
  const response = await fetch(collectionPath(collectionName));
  if (response.status === 404) return [];
  if (!response.ok) {
    throw new Error(`Could not load ${collectionName}: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  return (payload.documents || []).map((document) => {
    const id = decodeURIComponent(document.name.split("/").at(-1));
    return {
      id,
      ...fromFirestoreFields(document.fields || {}),
    };
  });
};

export const loadFirebaseState = async () => {
  if (!isFirebaseConfigured() || firebaseDisabled) return null;

  try {
    const entries = [];
    for (const collectionName of syncedCollections) {
      entries.push([collectionName, await loadCollection(collectionName)]);
    }
    lastError = "";

    const loadedState = Object.fromEntries(entries);
    const hasRemoteData = entries.some(([, documents]) => documents.length > 0);
    return hasRemoteData ? loadedState : null;
  } catch (error) {
    lastError = error.message || "Firebase load failed.";
    if (isPermissionError(error)) {
      firebaseDisabled = true;
      console.warn("Firebase sync disabled: Firestore rules rejected this browser. Using local app data instead.");
    } else {
      console.warn(lastError);
    }
    return null;
  }
};

const writeDocument = async (collectionName, item) => {
  const id = item.id ?? Date.now();
  const response = await fetch(documentPath(collectionName, id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFirestoreFields(cleanForFirebase({ ...item, id })) }),
  });

  if (!response.ok) {
    throw new Error(`Could not save ${collectionName}/${id}: ${response.status} ${await response.text()}`);
  }
};

const deleteDocument = async (collectionName, id) => {
  const response = await fetch(documentPath(collectionName, id), {
    method: "DELETE",
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Could not delete ${collectionName}/${id}: ${response.status} ${await response.text()}`);
  }
};

const syncFirebaseState = async (state) => {
  const payload = Object.fromEntries(
    syncedCollections.map((collectionName) => [collectionName, state[collectionName] || []])
  );
  const serializedPayload = JSON.stringify(payload);
  if (serializedPayload === lastSyncedPayload) return;

  const remoteEntries = [];
  for (const collectionName of syncedCollections) {
    remoteEntries.push([collectionName, await loadCollection(collectionName)]);
  }
  const remoteCollections = Object.fromEntries(remoteEntries);

  for (const collectionName of syncedCollections) {
    const staleItems = (() => {
      const localIds = new Set((payload[collectionName] || []).map((item) => String(item.id)));
      return (remoteCollections[collectionName] || [])
        .filter((item) => !localIds.has(String(item.id)));
    })();

    for (const item of staleItems) {
      await deleteDocument(collectionName, item.id);
    }
  }

  for (const collectionName of syncedCollections) {
    for (const item of payload[collectionName] || []) {
      await writeDocument(collectionName, item);
    }
  }

  lastSyncedPayload = serializedPayload;
  lastError = "";
};

export const queueFirebaseSync = (state) => {
  if (!isFirebaseConfigured() || firebaseDisabled) return;

  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    syncFirebaseState(state).catch((error) => {
      lastError = error.message || "Firebase save failed.";
      if (isPermissionError(error)) {
        firebaseDisabled = true;
        console.warn("Firebase sync disabled: Firestore rules rejected writes from this browser. Local changes are still saved.");
        return;
      }
      console.warn(lastError);
    });
  }, 750);
};
