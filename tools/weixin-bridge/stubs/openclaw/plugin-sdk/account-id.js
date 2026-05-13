export function normalizeAccountId(raw) {
  return String(raw ?? "").replaceAll("@", "-").replaceAll(".", "-");
}
