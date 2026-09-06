export type PartySizeRange = {
  min: number;
  max: number;
};

const SIZE_BY_TOKEN: Record<string, number> = {
  solo: 1,
  duo: 2,
  trio: 3,
};

const TOKEN_RE = /\b(solo|duo|trio|\d+\s*-?\s*man)\b/gi;
const N_MAN_RE = /^(\d+)\s*-?\s*man$/i;

export function inferPartySize(text: string): PartySizeRange {
  const sizes = new Set<number>();

  for (const match of text.matchAll(TOKEN_RE)) {
    const token = match[1]?.trim() ?? "";
    const named = SIZE_BY_TOKEN[token.toLowerCase()];
    if (named != null) {
      sizes.add(named);
      continue;
    }
    const man = token.match(N_MAN_RE);
    if (man) {
      const count = Number(man[1]);
      if (Number.isFinite(count) && count > 0) sizes.add(count);
    }
  }

  if (sizes.size === 0) {
    return { min: 1, max: 1 };
  }

  const values = [...sizes];
  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

export function partyRangesOverlap(a: PartySizeRange, b: PartySizeRange): boolean {
  return a.min <= b.max && b.min <= a.max;
}
