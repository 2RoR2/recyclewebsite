import { createSign } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { collectionLocation, gameItems, state, wasteGuide, wasteTypes } from "../src/backend/database.js";

const projectId = process.env.FIREBASE_PROJECT_ID || "recyclewebsite123";
const databaseId = process.env.FIRESTORE_DATABASE_ID || "(default)";
const firestoreRoot = `projects/${projectId}/databases/${databaseId}/documents`;

const slug = (value) =>
  String(value)
    .trim()
    .toLowerCase()
    .replaceAll("&", "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const stationCode = (bin) => bin.qrCode?.split("-")[0] || slug(bin.station || bin.location).toUpperCase();

const buildDataset = () => {
  const categories = wasteTypes.map((name, index) => ({
    id: slug(name),
    name,
    order: index + 1,
    active: true,
  }));

  const stationsByCode = new Map();
  for (const bin of state.bins) {
    const code = stationCode(bin);
    if (!stationsByCode.has(code)) {
      stationsByCode.set(code, {
        id: code,
        code,
        name: bin.station || bin.location,
        location: bin.location,
        lat: bin.lat,
        lng: bin.lng,
        mapX: bin.mapX,
        mapY: bin.mapY,
        binIds: [],
      });
    }
    stationsByCode.get(code).binIds.push(bin.id);
  }

  return {
    appConfig: {
      main: {
        projectId,
        categories: wasteTypes,
        aiModelClasses: ["paper", "plastic", "aluminium_can", "general_waste"],
        updatedAt: new Date().toISOString(),
      },
    },
    categories,
    wasteGuide: wasteGuide.map(([type, examples, tip], index) => ({
      id: slug(type),
      type,
      examples,
      tip,
      order: index + 1,
    })),
    gameItems,
    collectionLocations: [
      {
        id: slug(collectionLocation.name),
        ...collectionLocation,
      },
    ],
    stations: [...stationsByCode.values()],
    bins: state.bins,
    rewards: state.rewards.map((reward) => ({
      ...reward,
      id: String(reward.id),
      active: true,
    })),
    users: state.users.map(({ password, ...user }) => ({
      ...user,
      id: String(user.id),
      authProvider: "demo-local",
      hasSeedPassword: Boolean(password),
    })),
    records: state.records,
    redeemed: state.redeemed,
    feedback: state.feedback,
    learningRecords: state.learningRecords,
  };
};

const base64url = (value) =>
  Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

const loadServiceAccount = async () => {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return JSON.parse(await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
  }

  throw new Error(
    "Missing credentials. Set GOOGLE_APPLICATION_CREDENTIALS to a Firebase service-account JSON file, " +
      "or set FIREBASE_SERVICE_ACCOUNT_JSON to the JSON content."
  );
};

const accessToken = async (serviceAccount) => {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(serviceAccount.private_key, "base64url");
  const assertion = `${header}.${payload}.${signature}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`OAuth token request failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()).access_token;
};

const firestoreValue = (value) => {
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };

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
      return { mapValue: { fields: firestoreFields(value) } };
    default:
      return { nullValue: null };
  }
};

const firestoreFields = (data) =>
  Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, firestoreValue(value)])
  );

const documentName = (collectionName, id) =>
  `${firestoreRoot}/${collectionName}/${encodeURIComponent(String(id))}`;

const addCollectionWrites = (writes, collectionName, docs) => {
  for (const doc of docs) {
    const { id, ...data } = doc;
    writes.push({
      update: {
        name: documentName(collectionName, id),
        fields: firestoreFields(data),
      },
    });
  }
};

const seedFirestore = async (dataset) => {
  const token = await accessToken(await loadServiceAccount());
  const writes = [];

  for (const [id, data] of Object.entries(dataset.appConfig)) {
    writes.push({
      update: {
        name: documentName("appConfig", id),
        fields: firestoreFields(data),
      },
    });
  }

  addCollectionWrites(writes, "categories", dataset.categories);
  addCollectionWrites(writes, "wasteGuide", dataset.wasteGuide);
  addCollectionWrites(writes, "gameItems", dataset.gameItems);
  addCollectionWrites(writes, "collectionLocations", dataset.collectionLocations);
  addCollectionWrites(writes, "stations", dataset.stations);
  addCollectionWrites(writes, "bins", dataset.bins);
  addCollectionWrites(writes, "rewards", dataset.rewards);
  addCollectionWrites(writes, "users", dataset.users);

  const url =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/${encodeURIComponent(databaseId)}/documents:commit`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ writes }),
  });

  if (!response.ok) {
    throw new Error(`Firestore commit failed: ${response.status} ${await response.text()}`);
  }
};

const main = async () => {
  const dataset = buildDataset();
  const exportIndex = process.argv.indexOf("--export");
  const exportPath = exportIndex === -1 ? null : resolve(process.argv[exportIndex + 1] || "data/firestore-seed.json");

  if (exportPath) {
    await mkdir(dirname(exportPath), { recursive: true });
    await writeFile(exportPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
    console.log(`Wrote Firestore seed dataset to ${exportPath}`);
    return;
  }

  await seedFirestore(dataset);
  console.log(`Seeded Firestore project ${projectId} (${databaseId}) with Paper, Plastic, Aluminium Can, and General Waste data.`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
