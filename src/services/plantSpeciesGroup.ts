import type { ProductCandidate } from "@/types/shopwarePublishing";

const SPECIES_GROUP_PATTERN = /(?:^|[\s(])spp\.?(?=$|[\s),;:/-])/iu;
const GENUS_BEFORE_SPP_PATTERN = /([\p{L}][\p{L}×.'’-]*)\s+spp\.?/iu;

export function isSpeciesGroupCandidate(candidate: ProductCandidate) {
  return SPECIES_GROUP_PATTERN.test(
    `${candidate.latinName} ${candidate.germanName}`
  );
}

export function speciesGroupLatinName(candidate: ProductCandidate) {
  for (const value of [candidate.latinName, candidate.germanName]) {
    const genus = value.match(GENUS_BEFORE_SPP_PATTERN)?.[1]?.trim();
    if (genus) return `${genus} spp.`;
  }
  return candidate.latinName.trim() || candidate.germanName.trim();
}

export function speciesGroupPrompt(candidate: ProductCandidate) {
  if (!isSpeciesGroupCandidate(candidate)) return "";
  const groupName = speciesGroupLatinName(candidate);
  return `
SONDERFALL ARTENGRUPPE (${groupName}):
- "spp." bezeichnet hier mehrere nicht näher festgelegte Arten derselben Gattung. Es ist keine einzelne Art und keine konkrete Sorte zu behaupten.
- Recherchiere die Gattung allgemein und nenne im Identitäts- oder Erscheinungsabschnitt zwei bis fünf der in Deutschland beziehungsweise im europäischen Pflanzenhandel verbreitetsten Arten als typische Vertreter, sofern das Dossier sie zuverlässig belegt.
- confirmedLatinName muss "${groupName}" bleiben. Wähle nicht eigenmächtig eine einzelne Art aus.
- confirmedGermanName muss ein gebräuchlicher allgemeiner deutscher Gruppen- oder Gattungsname sein, nicht der Trivialname nur einer Art.
- Formuliere den Kundentext positiv und allgemein über die Artengruppe. Schreibe nicht, die Art sei unklar, unbekannt oder nicht verifiziert.
- Übernimm nur Eigenschaften und Pflegehinweise, die für die verbreiteten Vertreter gemeinsam beziehungsweise als belastbare Bandbreite gelten. Artenabhängige Unterschiede klar als mögliche Variation innerhalb der Gattung beschreiben und keine artspezifische Blüte, Wuchsform oder Frostgrenze auf alle Arten übertragen.
- Titel und Einleitung dürfen den allgemeinen Gruppennamen verwenden; die verbreiteten Arten gehören erklärend in den Fließtext, nicht als behauptete Identität des angebotenen Exemplars.`;
}
