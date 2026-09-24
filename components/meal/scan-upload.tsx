"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/** Requests camera permission only when the camera is used; upload works without it (FR-028). */
export function ScanUpload({ onFileSelected }: { onFileSelected: (file: File) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

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

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button onClick={handleUseCamera} type="button">
          📸 Use Camera
        </Button>
        <Button variant="outline" type="button" onClick={() => fileInputRef.current?.click()}>
          Upload Photo
        </Button>
      </div>
      {cameraError && <p className="text-sm text-amber-700">{cameraError}</p>}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelected(file);
        }}
      />
    </div>
  );
}
