import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { GET as healthHandler } from "@/app/api/health/route";
import { enqueueAiJob, dequeueAiJobs } from "@/lib/jobs/aiQueue";
import { prisma } from "@/lib/db/prisma";

describe("T17 Contract Test: Async AI Queue & Health Check", () => {
  it("GET /api/health returns valid JSON with health fields", async () => {
    const response = await healthHandler();
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.status).toBeDefined();
    expect(data.database).toBe("Healthy");
    expect(data.storage).toBeDefined();
    expect(typeof data.tomtomKeyPresent).toBe("boolean");
    expect(typeof data.geminiKeyPresent).toBe("boolean");
    expect(typeof data.groqKeyPresent).toBe("boolean");
    expect(data.timestamp).toBeDefined();
  });

  let createdJobId: string | null = null;

  afterAll(async () => {
    if (createdJobId) {
      try {
        await prisma.aiJob.delete({ where: { id: createdJobId } });
      } catch {
        // ignore cleanup error
      }
    }
  });

  it("enqueues and dequeues AiJob rows asynchronously off the request path", async () => {
    const targetId = `test_target_${Date.now()}`;
    const job = await enqueueAiJob({
      feature: "G1",
      targetId,
    });
    createdJobId = job.id;

    expect(job.id).toBeDefined();
    expect(job.feature).toBe("G1");
    expect(job.targetId).toBe(targetId);
    expect(job.status).toBe("queued");
    expect(job.attempts).toBe(0);

    const dequeued = await dequeueAiJobs("G1", 100);
    const found = dequeued.find((j) => j.id === job.id);
    expect(found).toBeDefined();
    expect(found!.targetId).toBe(targetId);

    // Clean up test job
    await prisma.aiJob.delete({ where: { id: job.id } });
  });

  it("acceptance: no SSE route exists under api/events", () => {
    const rootDir = process.cwd();
    const eventsPath = path.join(rootDir, "src", "app", "api", "events", "route.ts");
    expect(fs.existsSync(eventsPath)).toBe(false);
  });
});
