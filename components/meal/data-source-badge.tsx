import { Badge } from "@/components/ui/badge";

const LABELS: Record<string, string> = {
  visual_estimate: "Visual estimate",
  packaged_label: "Manufacturer label",
  restaurant_data: "Restaurant data",
};

/** Discloses which data source produced a result (FR-025). */
export function DataSourceBadge({ dataSource }: { dataSource: string }) {
  return <Badge>{LABELS[dataSource] ?? dataSource}</Badge>;
}
