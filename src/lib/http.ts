export function emptyJsonPost(
  headers: Record<string, string> = {}
): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: "{}",
  };
}
