"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface CandidateView {
  id: string;
  usdaFdcId: number;
  usdaDescription: string;
  usdaDataType: string;
  score: number;
  status: string;
  createdAt: string;
  /** Total stored records collapsed into this logical choice (1 = no duplicates). */
  memberCount: number;
  /** FDC IDs of all collapsed records, representative first. */
  memberFdcIds: number[];
}

export interface MappingGroup {
  normalizedDescription: string;
  foodDescription: string;
  verified: { usdaFdcId: number; usdaDescription: string } | null;
  candidates: CandidateView[];
}

/** Review board: verify or reject USDA candidates; leaving them unresolved is the default. */
export function ReviewBoard({ groups }: { groups: MappingGroup[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function review(candidateId: string, action: "verify" | "reject") {
    setBusy(candidateId);
    try {
      const response = await fetch("/api/v1/admin/food-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-review": "1" },
        body: JSON.stringify({ candidateId, action }),
      });
      if (!response.ok) throw new Error(`Review failed (HTTP ${response.status})`);
      setErrors((old) => ({ ...old, [candidateId]: "" }));
      router.refresh();
    } catch (error) {
      setErrors((old) => ({ ...old, [candidateId]: error instanceof Error ? error.message : "Review failed" }));
    } finally {
      setBusy(null);
    }
  }

  if (!groups.length) {
    return (
      <p className="text-sm opacity-70">
        No candidates yet. They appear here as scans and corrections discover USDA matches for human review.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <Card key={group.normalizedDescription}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {group.foodDescription}
              <span className="text-sm font-normal opacity-60">({group.normalizedDescription})</span>
              {group.verified && <Badge variant="success">verified: {group.verified.usdaDescription}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {group.candidates.map((candidate) => (
              <div key={candidate.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                <div>
                  <p className="font-medium">{candidate.usdaDescription}</p>
                  <p className="opacity-70">
                    FDC {candidate.usdaFdcId} · {candidate.usdaDataType} · score {candidate.score.toFixed(2)}
                  </p>
                  {candidate.memberCount > 1 && (
                    <p className="opacity-60">
                      {candidate.memberCount} equivalent USDA records ({candidate.memberFdcIds.join(", ")}) shown as
                      one choice; this action reviews FDC {candidate.usdaFdcId}.
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      candidate.status === "verified"
                        ? "success"
                        : candidate.status === "rejected"
                          ? "destructive"
                          : "warning"
                    }
                  >
                    {candidate.status}
                  </Badge>
                  {candidate.status !== "verified" && (
                    <Button type="button" disabled={busy === candidate.id} onClick={() => void review(candidate.id, "verify")}>
                      Verify
                    </Button>
                  )}
                  {candidate.status !== "rejected" && (
                    <Button type="button" variant="outline" disabled={busy === candidate.id} onClick={() => void review(candidate.id, "reject")}>
                      Reject
                    </Button>
                  )}
                </div>
                {errors[candidate.id] && <p role="alert" className="w-full text-red-700">{errors[candidate.id]}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
