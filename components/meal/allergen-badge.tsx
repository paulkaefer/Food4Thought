import { Badge } from "@/components/ui/badge";

/** Always shown regardless of the user's saved restrictions (FR-015, SC-003). */
export function AllergenBadge({ allergen }: { allergen: string }) {
  return <Badge variant="destructive">⚠️ {allergen.replace("_", " ")}</Badge>;
}
