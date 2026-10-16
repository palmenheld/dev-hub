import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  OverwinteringPlant,
  OverwinteringPhoto,
  OverwinteringRecord,
  OverwinteringRecordInput,
} from "@/types/overwintering";

const dataDirectory =
  process.env.OVERWINTERING_DATA_DIR ??
  path.join(process.cwd(), ".data", "overwintering");
const recordsFile = path.join(dataDirectory, "records.json");
const photoDirectory = path.join(dataDirectory, "photos");

const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;
const MAX_IMAGE_SIZE = 15 * 1024 * 1024;

let activeMutation = false;

function isMissingFile(error: unknown) {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

function assertUuid(value: string, label = "ID") {
  if (!/^[0-9a-f-]{36}$/iu.test(value)) throw new Error(`Ungültige ${label}.`);
}

function normalizeText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeInput(
  input: Partial<OverwinteringRecordInput>,
  current?: OverwinteringRecord
) {
  const customer = input.customer;
  const customerId = normalizeText(customer?.id, 100);
  const displayName = normalizeText(customer?.displayName, 240);
  if (!customerId || !displayName) {
    throw new Error("Bitte zuerst einen Weclapp-Kunden auswählen.");
  }
  const currentPlants = new Map(
    (current?.plants ?? []).map((plant) => [plant.id, plant])
  );
  const plants = Array.isArray(input.plants)
    ? input.plants.slice(0, 500).map((plant) => {
        const id = normalizeText(plant.id, 36) || randomUUID();
        assertUuid(id, "Pflanzen-ID");
        const existing = currentPlants.get(id);
        return {
          id,
          name: normalizeText(plant.name, 240),
          specialFeature: normalizeText(plant.specialFeature, 4_000),
          photos: existing?.photos ?? [],
        } satisfies OverwinteringPlant;
      })
    : [];
  if (!plants.length) throw new Error("Bitte mindestens eine Pflanze anlegen.");
  if (plants.some((plant) => !plant.name)) {
    throw new Error("Bitte jeder Pflanze einen Namen geben.");
  }
  if (new Set(plants.map((plant) => plant.id)).size !== plants.length) {
    throw new Error("Eine Pflanzenzeile ist doppelt vorhanden.");
  }
  return {
    customer: {
      id: customerId,
      customerNumber: normalizeText(customer?.customerNumber, 100),
      displayName,
      address: {
        street: normalizeText(customer?.address?.street, 300),
        zipcode: normalizeText(customer?.address?.zipcode, 40),
        city: normalizeText(customer?.address?.city, 180),
        country: normalizeText(customer?.address?.country, 80) || "DE",
      },
    },
    plants,
    notes: normalizeText(input.notes, 10_000),
  };
}

function matchesSignature(contentType: keyof typeof IMAGE_TYPES, bytes: Uint8Array) {
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (contentType === "image/gif") return String.fromCharCode(...bytes.slice(0, 6)).startsWith("GIF8");
  return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

async function withMutation<T>(action: () => Promise<T>) {
  if (activeMutation) throw new Error("Eine Überwinterungsakte wird gerade gespeichert. Bitte kurz erneut versuchen.");
  activeMutation = true;
  try {
    return await action();
  } finally {
    activeMutation = false;
  }
}

async function writeRecords(records: OverwinteringRecord[]) {
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  const temporary = `${recordsFile}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(records, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, recordsFile);
}

export async function listOverwinteringRecords() {
  try {
    const records = JSON.parse(await readFile(recordsFile, "utf8")) as OverwinteringRecord[];
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (error) {
    if (isMissingFile(error)) return [];
    throw error;
  }
}

export async function getOverwinteringRecord(id: string) {
  assertUuid(id, "Überwinterungs-ID");
  return (await listOverwinteringRecords()).find((record) => record.id === id) ?? null;
}

export async function createOverwinteringRecord(input: Partial<OverwinteringRecordInput>) {
  return withMutation(async () => {
    const records = await listOverwinteringRecords();
    const now = new Date().toISOString();
    const created: OverwinteringRecord = {
      id: randomUUID(),
      ...normalizeInput(input),
      createdAt: now,
      updatedAt: now,
    };
    await writeRecords([created, ...records]);
    return created;
  });
}

export async function updateOverwinteringRecord(
  id: string,
  input: Partial<OverwinteringRecordInput>
) {
  assertUuid(id, "Überwinterungs-ID");
  return withMutation(async () => {
    const records = await listOverwinteringRecords();
    const index = records.findIndex((record) => record.id === id);
    if (index < 0) return null;
    const current = records[index];
    const normalized = normalizeInput(input, current);
    const retained = new Set(normalized.plants.map((plant) => plant.id));
    const removed = current.plants.filter((plant) => !retained.has(plant.id));
    const updated: OverwinteringRecord = {
      ...current,
      ...normalized,
      updatedAt: new Date().toISOString(),
    };
    records[index] = updated;
    await writeRecords(records);
    await Promise.all(
      removed.map((plant) =>
        rm(path.join(photoDirectory, id, plant.id), { recursive: true, force: true })
      )
    );
    return updated;
  });
}

export async function addOverwinteringPhoto(
  recordId: string,
  plantId: string,
  file: File
) {
  assertUuid(recordId, "Überwinterungs-ID");
  assertUuid(plantId, "Pflanzen-ID");
  return withMutation(async () => {
    const records = await listOverwinteringRecords();
    const recordIndex = records.findIndex((record) => record.id === recordId);
    if (recordIndex < 0) throw new Error("Die Überwinterungsakte wurde nicht gefunden.");
    const current = records[recordIndex];
    const plantIndex = current.plants.findIndex((plant) => plant.id === plantId);
    if (plantIndex < 0) throw new Error("Die Pflanze wurde nicht gefunden.");
    if (!file.size || file.size > MAX_IMAGE_SIZE) {
      throw new Error("Das Foto muss zwischen 1 Byte und 15 MB groß sein.");
    }
    const contentType = file.type.toLowerCase() as keyof typeof IMAGE_TYPES;
    const extension = IMAGE_TYPES[contentType];
    if (!extension) throw new Error("Erlaubt sind JPG, PNG, WebP und GIF.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesSignature(contentType, bytes)) {
      throw new Error("Das tatsächliche Bildformat stimmt nicht mit der Datei überein.");
    }
    const photoId = randomUUID();
    const fileName = `${photoId}.${extension}`;
    const directory = path.join(photoDirectory, recordId, plantId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(path.join(directory, fileName), bytes, { mode: 0o600 });
    const photo: OverwinteringPhoto = {
      id: photoId,
      originalName: file.name.replace(/[\r\n]/gu, " ").slice(0, 180) || fileName,
      fileName,
      contentType,
      size: bytes.byteLength,
      createdAt: new Date().toISOString(),
      url: `/api/overwintering/${recordId}/plants/${plantId}/photos/${photoId}`,
    };
    const plants = [...current.plants];
    plants[plantIndex] = {
      ...plants[plantIndex],
      photos: [...plants[plantIndex].photos, photo],
    };
    const updated = { ...current, plants, updatedAt: new Date().toISOString() };
    records[recordIndex] = updated;
    try {
      await writeRecords(records);
      return updated;
    } catch (error) {
      await unlink(path.join(directory, fileName)).catch(() => undefined);
      throw error;
    }
  });
}

export async function getOverwinteringPhoto(
  recordId: string,
  plantId: string,
  photoId: string
) {
  assertUuid(recordId, "Überwinterungs-ID");
  assertUuid(plantId, "Pflanzen-ID");
  assertUuid(photoId, "Foto-ID");
  const record = await getOverwinteringRecord(recordId);
  const photo = record?.plants
    .find((plant) => plant.id === plantId)
    ?.photos.find((item) => item.id === photoId);
  if (!photo || !/^[0-9a-f-]{36}\.(?:jpg|png|webp|gif)$/iu.test(photo.fileName)) return null;
  try {
    return {
      photo,
      body: await readFile(path.join(photoDirectory, recordId, plantId, photo.fileName)),
    };
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

export async function deleteOverwinteringPhoto(
  recordId: string,
  plantId: string,
  photoId: string
) {
  assertUuid(recordId, "Überwinterungs-ID");
  assertUuid(plantId, "Pflanzen-ID");
  assertUuid(photoId, "Foto-ID");
  return withMutation(async () => {
    const records = await listOverwinteringRecords();
    const recordIndex = records.findIndex((record) => record.id === recordId);
    if (recordIndex < 0) return null;
    const current = records[recordIndex];
    const plantIndex = current.plants.findIndex((plant) => plant.id === plantId);
    if (plantIndex < 0) return current;
    const photo = current.plants[plantIndex].photos.find((item) => item.id === photoId);
    if (!photo) return current;
    const plants = [...current.plants];
    plants[plantIndex] = {
      ...plants[plantIndex],
      photos: plants[plantIndex].photos.filter((item) => item.id !== photoId),
    };
    const updated = { ...current, plants, updatedAt: new Date().toISOString() };
    records[recordIndex] = updated;
    await writeRecords(records);
    await unlink(path.join(photoDirectory, recordId, plantId, photo.fileName)).catch(() => undefined);
    return updated;
  });
}
