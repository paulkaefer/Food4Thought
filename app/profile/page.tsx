import { RestrictionList } from "@/components/meal/restriction-list";

export default function ProfilePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Dietary restrictions</h1>
      <p className="text-sm opacity-70">
        Set the restrictions you'd like us to check every scan against. Leaving this empty is totally fine —
        we'll still always label common allergens and pork on every result.
      </p>
      <RestrictionList />
    </div>
  );
}
