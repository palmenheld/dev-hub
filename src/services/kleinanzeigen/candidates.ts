import { getProductCandidatesByIds } from "@/services/shopware/publishingCandidates";

export async function getKleinanzeigenCandidate(articleId: string) {
  const candidate = (await getProductCandidatesByIds([articleId], "GROSS1"))[0];
  if (!candidate) throw new Error("Der Weclapp-Artikel wurde nicht gefunden.");
  if (!Number.isFinite(candidate.price) || (candidate.price ?? 0) <= 0) {
    throw new Error("Für diesen Artikel ist kein gültiger GROSS1-Preis hinterlegt.");
  }
  return candidate;
}
