/**
 * Presentation helpers for USDA match display. Pure and self-contained — client
 * components must not pull in the prisma-importing nutrition modules.
 */

/** Minimal display normalization: case/punctuation-insensitive word bag. */
function wordBag(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .sort()
    .join(" ");
}

/**
 * A concise, human-readable label for a USDA description. USDA descriptions are
 * comma-separated with the food family first and the primary qualifier (cut, variety,
 * form) second; later segments are preparation, grade, trim, or packaging detail that
 * stays visible in the full description. Two segments never collapse DIFFERENT foods
 * (e.g. "Steak, broiled" vs "Steak sauce", "Apple, raw" vs "Apple, dried"), while
 * grade/trim variants of the same food intentionally share one readable label.
 */
export function conciseUsdaLabel(usdaDescription: string): string {
  const segments = usdaDescription
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) return usdaDescription;
  return segments.slice(0, 2).join(", ");
}

/**
 * The match label shown in scan results: the ingredient's own display name when it
 * already says the same thing as the USDA record (case/punctuation/word-order
 * differences aside), otherwise the concise USDA label. The full description and FDC ID
 * remain in the underlying data and the correction dropdown.
 */
export function usdaMatchDisplayLabel(ingredientName: string, usdaDescription: string): string {
  if (wordBag(ingredientName) === wordBag(usdaDescription)) return ingredientName;
  return conciseUsdaLabel(usdaDescription);
}

/** One dropdown option: compact label, plus the complete record detail for selection time. */
export interface ConciseOptionLabel {
  fdcId: number;
  /** Compact human-readable label, unique within the returned list. */
  label: string;
  /** Full USDA description, data type, and FDC ID — the accessible detail mechanism. */
  detail: string;
}

/**
 * Compact, unique labels for a candidate dropdown. Each option starts at the two-segment
 * concise label (FNDDS dish names like "Swiss steak" pass through untouched). When options
 * would collide — grade/trim variants of one record — the FIRST later segment that differs
 * within the group is appended as a " · qualifier" callout, so meaningful distinctions
 * (choice vs select, lean only vs lean and fat) survive while routine qualifiers and
 * metadata stay out of the visible text. Fully identical descriptions fall back to an FDC
 * suffix as the only remaining distinction.
 */
export function conciseUsdaOptionLabels(
  candidates: Array<{ fdcId: number; description: string; dataType: string }>,
): ConciseOptionLabel[] {
  const entries = candidates.map((candidate) => ({
    candidate,
    segments: candidate.description.split(",").map((segment) => segment.trim()).filter(Boolean),
    label: conciseUsdaLabel(candidate.description),
  }));

  const groups = new Map<string, typeof entries>();
  for (const entry of entries) {
    const key = entry.label.toLowerCase();
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const maxSegments = Math.max(...group.map((entry) => entry.segments.length));
    // Walk later segments; at each position, only still-colliding subgroups whose values
    // differ there receive the qualifier — the minimum meaningful distinction per option.
    for (let i = 2; i < maxSegments; i++) {
      const subGroups = new Map<string, typeof group>();
      for (const entry of group) {
        const key = entry.label.toLowerCase();
        const sub = subGroups.get(key) ?? [];
        sub.push(entry);
        subGroups.set(key, sub);
      }
      for (const sub of subGroups.values()) {
        if (sub.length < 2) continue;
        const values = new Set(sub.map((entry) => (entry.segments[i] ?? "").toLowerCase()));
        if (values.size < 2) continue;
        for (const entry of sub) {
          if (entry.segments[i]) entry.label = `${entry.label} · ${entry.segments[i]}`;
        }
      }
    }
  }

  // Last resort: descriptions identical even in full — only the FDC ID distinguishes them.
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.label.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const entry of entries) {
    if ((counts.get(entry.label.toLowerCase()) ?? 0) > 1) {
      entry.label = `${entry.label} · FDC ${entry.candidate.fdcId}`;
    }
  }

  return entries.map((entry) => ({
    fdcId: entry.candidate.fdcId,
    label: entry.label,
    detail: `${entry.candidate.description} · ${entry.candidate.dataType} · FDC ${entry.candidate.fdcId}`,
  }));
}
