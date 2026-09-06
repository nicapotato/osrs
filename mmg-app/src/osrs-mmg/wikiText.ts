const METRIC_RE = /(\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?\+?)/g;

export function formatWikiPlainText(text: string): string {
  return text
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([a-z])(and|or|from|of|with)(?=\s|[A-Z]|$)/g, "$1 $2")
    .replace(/(\S)(\()/g, "$1 $2")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function splitWikiMetrics(text: string): { text: string; metric: boolean }[] {
  const formatted = formatWikiPlainText(text);
  const parts: { text: string; metric: boolean }[] = [];
  let last = 0;
  for (const match of formatted.matchAll(METRIC_RE)) {
    const start = match.index ?? 0;
    if (start > last) {
      parts.push({ text: formatted.slice(last, start), metric: false });
    }
    parts.push({ text: match[0], metric: true });
    last = start + match[0].length;
  }
  if (last < formatted.length) {
    parts.push({ text: formatted.slice(last), metric: false });
  }
  return parts;
}
