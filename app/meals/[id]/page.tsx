import { prisma } from "@/lib/prisma";
import { ConsumptionControls } from "@/components/meal/consumption-controls";
import { ScanResultCard } from "@/components/meal/scan-result-card";
import { messageFor } from "@/lib/api/messages";

export default async function MealDetailPage({ params }: { params: { id: string } }) {
  const mealLogEntry = await prisma.mealLogEntry.findUnique({
    where: { id: params.id },
    include: { foodItems: { include: { allergenLabels: true, dietaryConflictFlags: true } } },
  });

  if (!mealLogEntry) {
    return <p>We couldn't find that meal.</p>;
  }

  return (
    <div className="space-y-6">
      <ScanResultCard
        result={{ status: mealLogEntry.status, message: messageFor(mealLogEntry.status), isFunEstimate: mealLogEntry.isFunEstimate }}
        foodItems={mealLogEntry.foodItems}
      />
      <ConsumptionControls mealLogEntryId={mealLogEntry.id} />
    </div>
  );
}
