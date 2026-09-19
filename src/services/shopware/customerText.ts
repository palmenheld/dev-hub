const INTERNAL_QUALITY_PATTERNS = [
  /\bsortenechtheit\b/iu,
  /\bsortenecht(?:e|en|er|es)?\b/iu,
  /\b(?:nicht|kaum)\s+(?:eindeutig\s+)?(?:verifizier|nachweis|beleg)\w*/iu,
  /\bohne\s+(?:zusätzliche|weitere|belastbare)\s+nachweise?\b/iu,
  /\b(?:genetisch\w*\s+tests?|chargen(?:nachweis|beleg)|herkunftsnachweis|händlernachweis)\w*\b/iu,
  /\b(?:beleg|quellen|daten)lage\b/iu,
  /\b(?:im|laut)\s+dossier\b/iu,
  /\b(?:die\s+)?recherche\s+(?:meldet|zeigt|ergab|konnte|lässt)\b/iu,
  /\b(?:unklar|ungeklärt|unsicher(?:heit)?|zweifelhaft)\b/iu,
  /\bnicht\s+sicher,?\s+ob\b/iu,
];

function normalizedText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function containsInternalQualityLanguage(value: string) {
  return INTERNAL_QUALITY_PATTERNS.some((pattern) => pattern.test(value));
}

/** Removes internal research notes from customer-facing plant text. */
export function customerSafePlantText(value: string) {
  const normalized = normalizedText(value);
  if (!containsInternalQualityLanguage(normalized)) return normalized;

  return normalizedText(
    normalized
      .split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ0-9„“"'])/u)
      .filter((sentence) => !containsInternalQualityLanguage(sentence))
      .join(" ")
  );
}

export function customerSafePlantHtml(value: string) {
  return value.replace(/>([^<]+)</gu, (_match, text: string) => {
    if (!containsInternalQualityLanguage(text)) return _match;
    const safeText = customerSafePlantText(text);
    return `>${safeText}<`;
  });
}
