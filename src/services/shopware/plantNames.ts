const PREFERRED_GERMAN_COMMON_NAMES = [
  {
    latinName: /^olea\s+europaea(?:\s|$)/iu,
    germanName: "Olivenbaum",
  },
];

function normalizedName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function preferredGermanCommonName(
  latinName: string,
  researchedGermanName: string
) {
  const normalizedLatinName = normalizedName(latinName);
  const override = PREFERRED_GERMAN_COMMON_NAMES.find(({ latinName: pattern }) =>
    pattern.test(normalizedLatinName)
  );
  return override?.germanName || normalizedName(researchedGermanName);
}
