import { weclappBinaryRequest } from "./client";

function requireWeclappId(value: string, label: string) {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${label} ist ungültig.`);
  }
  return normalized;
}

export function getArticleImage(articleId: string, articleImageId: string) {
  const safeArticleId = requireWeclappId(articleId, "Artikel-ID");
  const safeImageId = requireWeclappId(articleImageId, "Bild-ID");
  return weclappBinaryRequest(
    `article/id/${safeArticleId}/downloadArticleImage`,
    { articleImageId: safeImageId }
  );
}
