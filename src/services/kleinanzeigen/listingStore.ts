import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CreateKleinanzeigenListingInput,
  KleinanzeigenListing,
  KleinanzeigenListingStatus,
} from "@/types/kleinanzeigen";

const dataDirectory =
  process.env.KLEINANZEIGEN_DATA_DIR ??
  path.join(process.cwd(), ".data", "kleinanzeigen");
const listingsFile = path.join(dataDirectory, "listings.json");

function isMissingFile(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function writeListings(listings: KleinanzeigenListing[]) {
  await mkdir(dataDirectory, { recursive: true });

  const temporaryFile = `${listingsFile}.${randomUUID()}.tmp`;
  await writeFile(temporaryFile, JSON.stringify(listings, null, 2), "utf8");
  await rename(temporaryFile, listingsFile);
}

export async function getKleinanzeigenListings() {
  try {
    const content = await readFile(listingsFile, "utf8");
    const parsed = JSON.parse(content) as KleinanzeigenListing[];

    return parsed.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (error) {
    if (isMissingFile(error)) {
      return [];
    }

    throw error;
  }
}

export async function createKleinanzeigenListing(
  input: CreateKleinanzeigenListingInput
) {
  const listings = await getKleinanzeigenListings();
  const now = new Date().toISOString();

  const listing: KleinanzeigenListing = {
    id: randomUUID(),
    articleId: input.articleId || undefined,
    sku: input.sku.trim(),
    title: input.title.trim(),
    description: input.description.trim(),
    price: input.price,
    category: input.category.trim(),
    location: input.location.trim(),
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };

  await writeListings([listing, ...listings]);

  return listing;
}

export async function updateKleinanzeigenListingStatus(
  id: string,
  status: KleinanzeigenListingStatus,
  additions: Partial<
    Pick<KleinanzeigenListing, "externalId" | "externalUrl" | "lastError">
  > = {}
) {
  const listings = await getKleinanzeigenListings();
  const index = listings.findIndex((listing) => listing.id === id);

  if (index === -1) {
    return null;
  }

  const updated: KleinanzeigenListing = {
    ...listings[index],
    ...additions,
    status,
    updatedAt: new Date().toISOString(),
  };

  listings[index] = updated;
  await writeListings(listings);

  return updated;
}
