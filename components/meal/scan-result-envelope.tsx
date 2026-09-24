import type { ApiEnvelope } from "@/lib/api/envelope";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

/** Reusable rendering of the shared response envelope (status + message + data-source) for any outcome (constitution III). */
export function ScanResultEnvelope({ result }: { result: ApiEnvelope }) {
  const variant =
    result.status === "identified" || result.status === "ok"
      ? "success"
      : result.status.startsWith("rejected")
        ? "destructive"
        : result.status === "needs_confirmation"
          ? "warning"
          : "default";

  return (
    <Alert variant={variant}>
      <AlertTitle className="flex items-center gap-2">
        {result.message}
        {result.isFunEstimate && <Badge variant="fun">just for fun</Badge>}
      </AlertTitle>
      {result.funEstimate && (
        <AlertDescription>
          {result.funEstimate.note} (not real nutrition data, never logged)
        </AlertDescription>
      )}
    </Alert>
  );
}
