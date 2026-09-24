import { weclappRequest } from "./client";

export type WeclappChannel = {
  id?: string;
  name?: string;
  description?: string;

  [key: string]: unknown;
};

type WeclappListResponse<T> = {
  result?: T[];
};

async function getAll<T>(
  resource: string,
  maxPages = 20
): Promise<T[]> {
  const all: T[] = [];

  for (
    let page = 1;
    page <= maxPages;
    page += 1
  ) {
    const response =
      await weclappRequest<
        WeclappListResponse<T>
      >(resource, {
        query: {
          page,
          pageSize: 100,
        },
      });

    const batch =
      response.result ?? [];

    all.push(...batch);

    if (batch.length < 100) {
      break;
    }
  }

  return all;
}

async function getAllOptional<T>(
  resource: string,
  maxPages = 20
): Promise<T[]> {
  try {
    return await getAll<T>(
      resource,
      maxPages
    );
  } catch {
    return [];
  }
}

export async function getSalesChannels() {
  return getAllOptional<WeclappChannel>(
    "salesChannel",
    10
  );
}

export async function getDistributionChannels() {
  return getAllOptional<WeclappChannel>(
    "distributionChannel",
    10
  );
}

function isGross1(value: unknown) {
  return (
    String(value ?? "")
      .trim()
      .toUpperCase() === "GROSS1"
  );
}

export function rowIsGross1(
  row: unknown
): boolean {
  if (
    !row ||
    typeof row !== "object"
  ) {
    return false;
  }

  return Object.entries(
    row as Record<string, unknown>
  ).some(([key, value]) => {
    if (
      !/(channel|vertrieb|code|name|identifier)/i.test(
        key
      )
    ) {
      return false;
    }

    if (
      value &&
      typeof value === "object"
    ) {
      return Object.values(
        value as Record<
          string,
          unknown
        >
      ).some(isGross1);
    }

    return isGross1(value);
  });
}
