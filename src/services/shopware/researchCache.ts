import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ProductCandidate,
  ProductResearch,
  ResearchSource,
} from "@/types/shopwarePublishing";

export const RESEARCH_POLICY_VERSION = "plant-research-v5-species-groups";

type CachedResearch = {
  version: string;
  cachedAt: string;
  research: ProductResearch;
  sources: ResearchSource[];
};

function normalized(value: string | number | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase("de-DE");
}

export function researchCacheKey(candidate: ProductCandidate) {
  const identity = [
    normalized(candidate.latinName),
    normalized(candidate.germanName),
    normalized(candidate.heightLabel || candidate.heightCm),
    normalized(candidate.potSize),
  ].join("|");
  return createHash("sha256")
    .update(`${RESEARCH_POLICY_VERSION}|${identity}`)
    .digest("hex");
}

function cacheDirectory() {
  return (
    process.env.OPENAI_RESEARCH_CACHE_DIR?.trim() ||
    path.join(process.cwd(), ".data", "research-cache")
  );
}

function cachePath(candidate: ProductCandidate) {
  return path.join(cacheDirectory(), `${researchCacheKey(candidate)}.json`);
}

function maxAgeMs() {
  const configured = Number(process.env.OPENAI_RESEARCH_CACHE_DAYS);
  const days =
    Number.isFinite(configured) && configured >= 1
      ? Math.min(configured, 365)
      : 30;
  return days * 24 * 60 * 60 * 1000;
}

export async function readCachedResearch(candidate: ProductCandidate) {
  try {
    const cached = JSON.parse(
      await readFile(cachePath(candidate), "utf8")
    ) as CachedResearch;
    if (
      cached.version !== RESEARCH_POLICY_VERSION ||
      !cached.cachedAt ||
      Date.now() - Date.parse(cached.cachedAt) > maxAgeMs() ||
      !cached.research?.confirmedLatinName ||
      !Array.isArray(cached.sources) ||
      cached.sources.length < 3
    ) {
      return null;
    }
    return { research: cached.research, sources: cached.sources };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    return null;
  }
}

export async function saveCachedResearch(
  candidate: ProductCandidate,
  research: ProductResearch,
  sources: ResearchSource[]
) {
  if (!research.researchComplete || sources.length < 3) return;
  const filePath = cachePath(candidate);
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const cached: CachedResearch = {
    version: RESEARCH_POLICY_VERSION,
    cachedAt: new Date().toISOString(),
    research,
    sources,
  };
  await writeFile(temporaryPath, `${JSON.stringify(cached)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, filePath);
}
