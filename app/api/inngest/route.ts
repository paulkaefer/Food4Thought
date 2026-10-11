import { serve } from "inngest/next";
import { inngest } from "@/lib/jobs/client";
import { processScan } from "@/lib/jobs/process-scan";
import { discoverVocabulary } from "@/lib/jobs/discover-vocabulary";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processScan, discoverVocabulary],
});
