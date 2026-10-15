/**
 * Browser-only image preparation. Original files stay on the user's device.
 * JPEG is used for predictable size and broad compatibility; transparent
 * source images are flattened against white.
 */
export const MAX_IMAGE_EDGE = 1536;
export const TARGET_IMAGE_BYTES = 300 * 1024;
export const MAX_OPTIMIZED_BYTES = 2 * 1024 * 1024;

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Unable to encode the photo.")),
      "image/jpeg",
      quality,
    );
  });
}

export async function optimizeMealPhoto(file: File): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Please select a JPEG, PNG, or WebP photograph.");
  }
  if (file.size === 0) throw new Error("The selected photograph is empty.");

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The photograph could not be opened."));
      image.src = objectUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("The photograph has invalid dimensions.");
    }

    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is not supported in this browser.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Preserve detail first; only lower quality if necessary to approach the target.
    let output = await encode(canvas, 0.85);
    for (const quality of [0.8, 0.75, 0.7, 0.65]) {
      if (output.size <= TARGET_IMAGE_BYTES) break;
      const candidate = await encode(canvas, quality);
      if (candidate.size < output.size) output = candidate;
    }
    if (output.size > MAX_OPTIMIZED_BYTES) {
      throw new Error("This photograph is still over 2 MB after optimization. Please try another.");
    }
    return new File([output], "meal-photo.jpg", { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
