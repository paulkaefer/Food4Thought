import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScanResultEnvelope } from "./scan-result-envelope";
import type { ApiEnvelope } from "@/lib/api/envelope";

interface FoodItemView {
  id: string;
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  nutritionIsApproximate: boolean;
  uncertaintyReason: string | null;
  dataSource: string;
  allergenLabels: { allergen: string }[];
}

/** Renders per-item and combined-total results, plus every rejected/approximate/fun-estimate state via the shared envelope. */
export function ScanResultCard({ result, foodItems }: { result: ApiEnvelope; foodItems?: FoodItemView[] }) {
  return (
    <div className="space-y-4">
      <ScanResultEnvelope result={result} />
      {foodItems?.map((item) => (
        <Card key={item.id}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{item.name}</CardTitle>
            <div className="flex gap-1">
              {item.nutritionIsApproximate && <Badge variant="warning">approximate</Badge>}
              <Badge>{item.dataSource.replace("_", " ")}</Badge>
              {item.allergenLabels.map((a) => (
                <Badge key={a.allergen} variant="destructive">
                  {a.allergen.replace("_", " ")}
                </Badge>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              {Math.round(item.calories)} kcal · {Math.round(item.proteinG)}g protein · {Math.round(item.carbsG)}g carbs ·{" "}
              {Math.round(item.fatG)}g fat
            </p>
            {item.uncertaintyReason && <p className="opacity-70">{item.uncertaintyReason}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
