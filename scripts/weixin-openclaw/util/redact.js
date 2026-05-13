export function redactUrl(url) {
  try {
    const parsed = new URL(url);
    for (const key of parsed.searchParams.keys()) {
      if (/token|key|param|auth/i.test(key)) parsed.searchParams.set(key, "***");
    }
    return parsed.toString();
  } catch {
    return String(url);
  }
}
