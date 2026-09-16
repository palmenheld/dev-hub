const activeMutations = new Set<string>();

export async function withMutationLock<T>(
  key: string,
  action: () => Promise<T>
): Promise<T> {
  if (activeMutations.has(key)) {
    throw new Error(
      "Dieser Vorgang wird bereits ausgeführt. Bitte das Ergebnis abwarten und nicht erneut senden."
    );
  }
  activeMutations.add(key);
  try {
    return await action();
  } finally {
    activeMutations.delete(key);
  }
}
