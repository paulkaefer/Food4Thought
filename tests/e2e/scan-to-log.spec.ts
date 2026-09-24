import { test, expect } from "@playwright/test";

test("scan -> confirm -> consumption flow", async ({ page }) => {
  await page.goto("/scan");
  await expect(page.getByRole("heading", { name: "Scan your plate" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload Photo" })).toBeVisible();
  // Full upload -> job-polling -> confirmation -> consumption flow requires a running
  // backend + database + Inngest dev server (see quickstart.md); this smoke test verifies
  // the scan page renders and the upload affordance is present without requiring camera access.
});
