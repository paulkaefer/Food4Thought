"use client";

import { useEffect, useRef, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { ScanUpload } from "@/components/meal/scan-upload";
import { ScanResultCard } from "@/components/meal/scan-result-card";
import { startScanPoller } from "@/lib/scan-poller";
import type { ApiEnvelope } from "@/lib/api/envelope";

interface MealLogEntryData {
  foodItems?: Parameters<typeof ScanResultCard>[0]["foodItems"];
}

/** Scan page: upload, dispatch, and poll for job completion (SC-001: within 5s under normal conditions). */
export default function ScanPage() {
  const [result, setResult] = useState<ApiEnvelope | null>(null);
  const [polling, setPolling] = useState(false);
  const [slow, setSlow] = useState(false);
  const cancelPollRef = useRef<(() => void) | null>(null);

  // Stop polling on unmount; starting a new scan also cancels any previous poll.
  useEffect(() => () => cancelPollRef.current?.(), []);

  async function handleFileSelected(file: File, description: string) {
    cancelPollRef.current?.();
    setPolling(true);
    setSlow(false);
    setResult(null);
    const formData = new FormData();
    formData.append("photo", file);
    if (description) formData.append("description", description);

    let submitBody: ApiEnvelope<{ jobId: string }>;
    try {
      const submitRes = await fetch("/api/v1/scans", { method: "POST", body: formData });
      submitBody = (await submitRes.json()) as ApiEnvelope<{ jobId: string }>;
      if (!submitRes.ok || !submitBody.data?.jobId) {
        setResult(submitBody);
        setPolling(false);
        return;
      }
    } catch {
      setResult({
        status: "error",
        message: "We couldn't submit that scan — check your connection and try again.",
        isFunEstimate: false,
      });
      setPolling(false);
      return;
    }

    // Polls until a terminal status (no fixed timeout): a still-processing response is
    // never rendered as a final result, so the "hang tight" copy can't go stale.
    cancelPollRef.current = startScanPoller({
      jobId: submitBody.data.jobId,
      onResult: (body) => {
        setResult(body);
        setPolling(false);
      },
      onSlowChange: setSlow,
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Scan your plate</h1>
      <ScanUpload onFileSelected={handleFileSelected} />
      {polling && (
        <div className="space-y-2">
          <p className="text-sm opacity-70">Scanning...</p>
          <Progress value={66} />
          {slow && (
            <p className="text-sm opacity-70">
              Still working on it — this scan is taking longer than usual. We&apos;ll keep checking; no need to
              re-upload.
            </p>
          )}
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
