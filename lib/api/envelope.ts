export type MealLogStatus =
  | "processing"
  | "identified"
  | "needs_confirmation"
  | "rejected_non_food"
  | "rejected_low_quality"
  | "rejected_invalid_file"
  | "empty_plate";

export interface FunEstimate {
  label: "just for fun";
  calories: number;
  note: string;
}

/** Shared response shape used by every scan/meal endpoint so success and every "honest failure" case look and behave consistently (constitution III). */
export interface ApiEnvelope<TData = unknown> {
  status: MealLogStatus | "ok" | "error";
  message: string;
  isFunEstimate: boolean;
  data?: TData;
  funEstimate?: FunEstimate;
}

export function envelope<TData>(params: {
  status: ApiEnvelope<TData>["status"];
  message: string;
  data?: TData;
  funEstimate?: FunEstimate;
}): ApiEnvelope<TData> {
  return {
    status: params.status,
    message: params.message,
    isFunEstimate: Boolean(params.funEstimate),
    data: params.data,
    funEstimate: params.funEstimate,
  };
}
