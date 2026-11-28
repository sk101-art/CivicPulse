import { describe, it, expect, vi } from "vitest";

// Fixed job secret and no LLM keys for this file, regardless of the developer's .env.local.
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    env: { ...actual.env, JOB_SECRET: "test-job-secret-123" },
    isConfigured: (key: string) =>
      key === "GEMINI_API_KEY" || key === "GROQ_API_KEY" ? false : actual.isConfigured(key as never),
  };
});

import { POST as jobPOST } from "@/app/api/jobs/[name]/route";
import { runJob, JOB_NAMES, JOB_HARD_TIMEOUT_MS } from "@/lib/jobs/runner";

function call(name: string, secret?: string) {
  return jobPOST(
    new Request(`http://localhost:3000/api/jobs/${name}`, {
      method: "POST",
      headers: secret ? { "x-job-secret": secret } : {},
    }),
    { params: Promise.resolve({ name }) }
  );
}

describe("Scheduled job endpoint (/api/jobs/[name])", () => {
  it("lists the scheduled jobs", () => {
    expect([...JOB_NAMES]).toEqual([
      "sla-check",
      "ai-queue",
      "weather",
      "priority-recompute",
      "traffic-sample",
      "durability",
      "traffic-profile",
      "insights",
      "ai-assess",
      "repair-windows",
      "geocode-backfill",
    ]);
  });

  it("rejects a missing or wrong secret with 401", async () => {
    expect((await call("sla-check")).status).toBe(401);
    expect((await call("sla-check", "wrong-secret")).status).toBe(401);
  });

  it("returns 404 for an unknown job name", async () => {
    const res = await call("drop-tables", "test-job-secret-123");
    expect(res.status).toBe(404);
  });

  it("records scheduled job skip outcomes with timestamps", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    const createSpy = vi.spyOn(prisma.scheduledJobRun, "create").mockResolvedValue({ id: "run-test" } as never);
    const updateSpy = vi.spyOn(prisma.scheduledJobRun, "update").mockResolvedValue({} as never);

    const res = await call("ai-queue", "test-job-secret-123");
    const update = updateSpy.mock.calls[0]?.[0];

    expect(res.status).toBe(200);
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ job: "ai-queue", status: "RUNNING" }),
    }));
    expect(update?.data).toEqual(expect.objectContaining({
      status: "SKIPPED",
      finishedAt: expect.any(Date),
      skipped: expect.stringContaining("No LLM key"),
    }));

    createSpy.mockRestore();
    updateSpy.mockRestore();
  });

  it("ai-queue leaves jobs queued when no LLM key is configured", async () => {
    const result = await runJob("ai-queue");
    expect(result.processed).toBe(0);
    expect(result.skipped).toMatch(/No LLM key/);
  });

  it("enforces a 50s hard timeout guard returning partial: true and HTTP 200 without error", async () => {
    expect(JOB_HARD_TIMEOUT_MS).toBe(50_000);

    const { prisma } = await import("@/lib/db/prisma");
    vi.spyOn(prisma.issue, "findMany").mockImplementationOnce(
      (() => new Promise((resolve) => setTimeout(() => resolve([]), 50))) as any
    );

    // Call runJob with a simulated short timeout (10ms) while task takes 50ms
    const res = await runJob("sla-check", 10);
    expect(res.partial).toBe(true);
    expect(res.processed).toBe(0);
    expect(res.remaining).toBe(0);
    expect(res.skipped).toMatch(/hard timeout guard/);
  });
});
