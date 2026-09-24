import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { envelope } from "./envelope";

/** Ensures no route ever leaks a bare stack trace to the client (constitution III); technical detail is logged server-side only. */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    console.error("[api] validation error", error.flatten());
    return NextResponse.json(
      envelope({
        status: "rejected_invalid_file",
        message: "Something about that request wasn't quite right — please check the form and try again.",
      }),
      { status: 400 },
    );
  }

  console.error("[api] unhandled error", error);
  return NextResponse.json(
    envelope({
      status: "error",
      message: "Something went sideways on our end. Please try again in a moment.",
    }),
    { status: 500 },
  );
}
