"use client";

import { useState } from "react";
import { Progress } from "@/components/ui/progress";
import { ScanUpload } from "@/components/meal/scan-upload";
import { ScanResultCard } from "@/components/meal/scan-result-card";
import type { ApiEnvelope } from "@/lib/api/envelope";

interface MealLogEntryData {
  foodItems?: Parameters<typeof ScanResultCard>[0]["foodItems"];
}

/** Scan page: upload, dispatch, and poll for job completion (SC-001: within 5s under normal conditions). */
export default function ScanPage() {
  const [result, setResult] = useState<ApiEnvelope | null>(null);
  const [polling, setPolling] = useState(false);

  async function handleFileSelected(file: File) {
    setPolling(true);
    setResult(null);
    const formData = new FormData();
    formData.append("photo", file);

    const submitRes = await fetch("/api/v1/scans", { method: "POST", body: formData });
    const submitBody = (await submitRes.json()) as ApiEnvelope<{ jobId: string }>;

    if (!submitRes.ok || !submitBody.data?.jobId) {
      setResult(submitBody);
      setPolling(false);
      return;
    }

    const jobId = submitBody.data.jobId;
    const started = Date.now();
    const poll = async (): Promise<void> => {
      const res = await fetch(`/api/v1/scans/${jobId}`);
      const body = (await res.json()) as ApiEnvelope;
      if (body.status === "processing" && Date.now() - started < 15000) {
        setTimeout(poll, 700);
        return;
      }
      setResult(body);
      setPolling(false);
    };
    poll();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Scan your plate</h1>
      <ScanUpload onFileSelected={handleFileSelected} />
      {polling && (
        <div className="space-y-2">
          <p className="text-sm opacity-70">Scanning...</p>
          <Progress value={66} />
        </div>
      )}
      {result && (
        <ScanResultCard
          result={result}
          foodItems={(result.data as { mealLogEntry?: MealLogEntryData })?.mealLogEntry?.foodItems ?? undefined}
        />
      )}
    </div>
  );
}
