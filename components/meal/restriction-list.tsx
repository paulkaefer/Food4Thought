"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const ALL_TYPES = ["gluten_free", "vegetarian", "vegan", "nut_allergy", "shellfish_allergy", "avoid_pork"] as const;
const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

/** Manages saved dietary restrictions; an empty list is valid and never suppresses allergen labels (FR-016). */
export function RestrictionList() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/users/${DEV_USER_ID}/dietary-restrictions`)
      .then((r) => r.json())
      .then((body) => {
        const rows = (body.data?.restrictions ?? []) as { type: string }[];
        setSelected(new Set(rows.map((r) => r.type)));
      });
  }, []);

  function toggle(type: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    await fetch(`/api/v1/users/${DEV_USER_ID}/dietary-restrictions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restrictions: Array.from(selected) }),
    });
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {ALL_TYPES.map((type) => (
          <button key={type} type="button" onClick={() => toggle(type)}>
            <Badge variant={selected.has(type) ? "success" : "default"}>{type.replace("_", " ")}</Badge>
          </button>
        ))}
      </div>
      <Button onClick={save} disabled={saving}>
        Save restrictions
      </Button>
    </div>
  );
}
