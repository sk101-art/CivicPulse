import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/feeds/route";
import { prisma } from "@/lib/db/prisma";
vi.mock("@/lib/env", () => ({ env: { JOB_SECRET: "feed-health-test-fixture" } }));
beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.restoreAllMocks());
const request = () => new Request("http://localhost/api/health/feeds", { headers: { "x-job-secret": "feed-health-test-fixture" } });
it("does not expose feed diagnostics without authorization", async () => {
  const result = await GET(new Request("http://localhost/api/health/feeds"));
  expect(result.status).toBe(401);
});
it("reports stale observations as unhealthy even when refresh jobs returned success", async () => {
  vi.spyOn(prisma.weatherForecast, "aggregate").mockResolvedValue({ _max: { fetchedAt: new Date(0) } } as never);
  vi.spyOn(prisma.trafficSample, "aggregate").mockResolvedValue({ _max: { sampledAt: new Date(0) } } as never);
  vi.spyOn(prisma.scheduledJobRun, "findMany").mockResolvedValue(["weather", "traffic-sample"].map((job) => ({ job, status: "SUCCEEDED", startedAt: new Date(), processed: 0, failed: 0, partial: false, skipped: null })) as never);
  const result = await GET(request()); const body = await result.json();
  expect(result.status).toBe(503);
  expect(body.feeds.every((feed: { stale: boolean }) => feed.stale)).toBe(true);
});
it("reports recent observations with successful jobs as healthy", async () => {
  vi.spyOn(prisma.weatherForecast, "aggregate").mockResolvedValue({ _max: { fetchedAt: new Date() } } as never);
  vi.spyOn(prisma.trafficSample, "aggregate").mockResolvedValue({ _max: { sampledAt: new Date() } } as never);
  vi.spyOn(prisma.scheduledJobRun, "findMany").mockResolvedValue(["weather", "traffic-sample"].map((job) => ({ job, status: "SUCCEEDED", startedAt: new Date(), processed: 5, failed: 0, partial: false, skipped: null })) as never);
  const result = await GET(request()); expect(result.status).toBe(200);
});

it("reports bounded partial refreshes explicitly without treating fresh observations as an outage", async () => {
  vi.spyOn(prisma.weatherForecast, "aggregate").mockResolvedValue({ _max: { fetchedAt: new Date() } } as never);
  vi.spyOn(prisma.trafficSample, "aggregate").mockResolvedValue({ _max: { sampledAt: new Date() } } as never);
  vi.spyOn(prisma.scheduledJobRun, "findMany").mockResolvedValue(["weather", "traffic-sample"].map((job) => ({ job, status: "PARTIAL", startedAt: new Date(), processed: 5, failed: 0, partial: true, skipped: null })) as never);
  const result = await GET(request()); const body = await result.json();
  expect(result.status).toBe(200);
  expect(body.feeds.every((feed: { partialRefresh: boolean }) => feed.partialRefresh)).toBe(true);
});
