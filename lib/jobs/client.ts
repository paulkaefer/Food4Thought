import { Inngest } from "inngest";

/** Durable background-job client used for any pipeline step that may exceed Vercel's serverless execution limit (research.md #11). */
export const inngest = new Inngest({ id: "food4thought" });
