"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { optimizeMealPhoto } from "@/lib/services/ingestion/optimize-image";

/** Requests camera permission only when the camera is used; upload works without it (FR-028). */
export function ScanUpload({ onFileSelected }: { onFileSelected: (file: File, description: string) => void | Promise<void> }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [description, setDescription] = useState("");

  async function handleUseCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((track) => track.stop());
      fileInputRef.current?.setAttribute("capture", "environment");
      fileInputRef.current?.click();
    } catch {
      setCameraError("We couldn't access your camera — you can still upload a photo below.");
    }
  }

  async function handleSelected(file: File) {
    setProcessingError(null);
    setOptimizing(true);
    try {
      const optimized = await optimizeMealPhoto(file);
      await onFileSelected(optimized, description.trim());
    } catch (error) {
      setProcessingError(error instanceof Error ? error.message : "Unable to process the photograph.");
    } finally {
      setOptimizing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <label htmlFor="meal-description" className="block text-sm font-medium">Describe your meal (optional)</label>
      <textarea id="meal-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={3} placeholder="e.g. Roasted beets, pistachios, and whipped goat cheese" className="w-full rounded-md border p-2 text-sm" />
      <p className="text-xs opacity-70">Help identify ingredients the camera may not show. The photo remains the primary evidence.</p>
      <div className="flex gap-2">
        <Button onClick={handleUseCamera} type="button" disabled={optimizing}>
          📸 Use Camera
        </Button>
        <Button variant="outline" type="button" disabled={optimizing} onClick={() => {
          fileInputRef.current?.removeAttribute("capture");
          fileInputRef.current?.click();
        }}>
          Upload Photo
        </Button>
      </div>
      {optimizing && <p className="text-sm opacity-70">Preparing your photo...</p>}
      {cameraError && <p className="text-sm text-amber-700">{cameraError}</p>}
      {processingError && <p role="alert" className="text-sm text-red-700">{processingError}</p>}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleSelected(file);
        }}
      />
    </div>
  );
}
