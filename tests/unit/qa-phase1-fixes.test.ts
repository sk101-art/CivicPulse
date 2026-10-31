import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/db/prisma";
import { buildPoolConfig } from "@/lib/db/prisma";
import { isDefaultedCoordinate, isInServiceArea } from "@/lib/evidence/coords";
import { verifyEvidence } from "@/lib/evidence/verify";
import { flushQueue, type QueueStore } from "@/hooks/useOfflineSync";
import { evaluateAuditDecision, accountAuditEligibility } from "@/lib/audit/rules";
import { listAuditTasksForUser } from "@/lib/audit/blindAudit";
import { TEXT_LIMITS, SERVICE_AREA_MESSAGE } from "@/lib/validation/limits";
import { displayLocation, isPlaceholderAddress, issueTitle } from "@/lib/issues/display";
import { latestReportPerIssue, nextTierProgress, publicDisplayName } from "@/lib/citizen/statsPure";
import { countIndependentConfirmations } from "@/lib/citizen/stats";
import { deskDisplayName, actorDisplayName } from "@/lib/issues/actors";
import { loadClaimGapData } from "@/lib/issues/claimGapData";
import { formatPriority } from "@/lib/priority";
import { isSignUpRequested } from "@/lib/auth/loginMode";
import { SectionBoundary } from "@/components/ui/SectionBoundary";
import { DeskAccessOnly } from "@/components/auth/DeskAccessOnly";
import { assertNotProduction, summarize, parseArgs } from "../../scripts/load-issue-page";
import { POST as reportsPOST } from "@/app/api/reports/route";
import { GET as claimGapGET } from "@/app/api/claim-gap/route";
import DeskLayout from "@/app/desk/layout";
import crypto from "crypto";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

const src = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf-8");

function citizenSession(id = "qa-fix-citizen") {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id, email: `${id}@example.com`, role: Role.CITIZEN },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  });
}

function postReport(body: unknown) {
  return reportsPOST(
    new Request("http://localhost:3000/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

const signedBody = (over: Record<string, unknown> = {}, payloadOver: Record<string, unknown> = {}) => ({
  category: "POTHOLES",
  payload: {
    accuracy: 8,
    capturedAt: new Date().toISOString(),
    lat: 12.93,
    lng: 77.6,
    nonce: "n",
    photoHash: "h",
    role: "REPORT",
    ...payloadOver,
  },
  signature: "sig",
  photoBase64: Buffer.from("jpeg").toString("base64"),
  ...over,
});

describe("QA phase 1 fixes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getServerSession).mockReset();
  });

  describe("A. Connection handling", () => {
    it("production keeps one connection per instance with a 5 s idle timeout (DB_POOL_MAX can override)", () => {
      expect(buildPoolConfig({ isTest: false })).toMatchObject({ max: 1, idleTimeoutMillis: 5000 });
      expect(buildPoolConfig({ isTest: false, poolMax: "3" }).max).toBe(3);
      expect(buildPoolConfig({ isTest: false, poolMax: "nonsense" }).max).toBe(1);
      expect(buildPoolConfig({ isTest: true }).max).toBe(10);
    });

    it("every route and page uses the shared client: no other Pool or PrismaClient in src/", () => {
      const offenders: string[] = [];
      const walk = (dir: string) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) walk(p);
          else if (/\.(ts|tsx)$/.test(e.name)) {
            const s = fs.readFileSync(p, "utf-8");
            if (/new Pool\(|new PrismaClient\(/.test(s) && !p.replace(/\\/g, "/").endsWith("src/lib/db/prisma.ts")) {
              offenders.push(p);
            }
          }
        }
      };
      walk(path.join(process.cwd(), "src"));
      expect(offenders).toEqual([]);
    });

    it("functions run next to the database (Mumbai) instead of the default US region", () => {
      expect(JSON.parse(src("vercel.json")).regions).toEqual(["bom1"]);
    });

    it("pages batch their reads and the public issue page no longer runs an AI assessment per view", () => {
      const issuePage = src("src/app/(public)/issue/[id]/page.tsx");
      expect(issuePage).not.toMatch(/assessIssue\(/);
      expect(issuePage).toMatch(/getStoredAssessmentSummary/);
      expect(issuePage).toMatch(/Promise\.all\(/);
      for (const p of [
        "src/app/(public)/ward/[id]/page.tsx",
        "src/app/citizen/report/[id]/page.tsx",
        "src/lib/issues/claimGapData.ts",
        "src/lib/citizen/stats.ts",
      ]) {
        expect(src(p), p).toMatch(/Promise\.all\(/);
      }
    });

    it("load-test script refuses the production domain and summarizes failures", () => {
      expect(() => assertNotProduction("https://civic-pulse-cyan-ten.vercel.app", false)).toThrow(/Refusing/);
      expect(() => assertNotProduction("https://civic-pulse-git-v2.vercel.app", false)).not.toThrow();
      const s = summarize([
        { status: 200, ms: 100 },
        { status: 500, ms: 300, error: "pooler error in body: EMAXCONNSESSION" },
        { status: null, ms: 900, error: "fetch failed" },
      ]);
      expect(s).toMatchObject({ total: 3, ok: 1, failed: 2 });
      expect(s.errors.join(" ")).toMatch(/EMAXCONN/);
      expect(parseArgs(["https://x.vercel.app", "issue-1", "--n=20"])).toMatchObject({ n: 20, issueId: "issue-1" });
    });
  });

  describe("5. Live camera + real GPS only", () => {
    it("no gallery / file upload path exists for evidence", () => {
      for (const p of ["src/components/evidence/CaptureCamera.tsx", "src/app/citizen/report/page.tsx", "src/app/citizen/audit/page.tsx"]) {
        const s = src(p);
        expect(s, p).not.toMatch(/Choose from Device|type="file"|onDeviceUpload|createEvidenceFromBlob/);
      }
      // the report page never substitutes coordinates
      expect(src("src/app/citizen/report/page.tsx")).not.toMatch(/12\.9716/);
    });

    it("defaulted coordinates are recognised and rejected by the evidence verifier", async () => {
      expect(isDefaultedCoordinate(12.9716, 77.5946)).toBe(true);
      expect(isDefaultedCoordinate(12.9717, 77.5946)).toBe(false);
      const photo = Buffer.from("photo-bytes");
      const result = await verifyEvidence(
        "anyone",
        {
          accuracy: 10,
          capturedAt: new Date().toISOString(),
          lat: 12.9716,
          lng: 77.5946,
          nonce: "never-consumed",
          photoHash: crypto.createHash("sha256").update(photo).digest("hex"),
          role: "REPORT",
        },
        "sig",
        photo,
        "REPORT"
      );
      expect(result).toMatchObject({ valid: false, reason: "DEFAULTED_COORDINATES" });
    });

    it("the report API rejects defaulted coordinates even on the offline path", async () => {
      citizenSession();
      const res = await postReport(signedBody({ offline: true }, { lat: 12.9716, lng: 77.5946 }));
      expect(res.status).toBe(400);
      expect(JSON.stringify(await res.json())).toMatch(/DEFAULTED_COORDINATES/);
    });
  });

  describe("6. Offline duplicates", () => {
    function memoryStore(items: Array<Record<string, unknown>>) {
      const map = new Map(items.map((i) => [i.id as string, { ...i }]));
      const store: QueueStore & { map: typeof map } = {
        map,
        getAll: async () => Array.from(map.values()),
        put: async (_s, v) => void map.set((v as { id: string }).id, v as Record<string, unknown>),
        delete: async (_s, k) => void map.delete(k),
      };
      return store;
    }

    it("removes a report once the server has it and reuses one clientReportId across retries", async () => {
      const store = memoryStore([{ id: "offline-1", category: "POTHOLES", createdAt: 1, synced: false }]);
      const sent: Array<Record<string, unknown>> = [];

      // First attempt: network failure. The id is persisted before sending.
      await flushQueue(store, async (body) => {
        sent.push(body);
        throw new TypeError("Failed to fetch");
      });
      expect(store.map.size).toBe(1);
      const firstId = sent[0].clientReportId;
      expect(firstId).toMatch(/^[0-9a-f-]{36}$/);

      // Retry: server stores it (or answers "already stored"), the queue empties, same id was sent.
      const synced = await flushQueue(store, async (body) => {
        sent.push(body);
        return { ok: true, status: 200 };
      });
      expect(synced).toBe(1);
      expect(store.map.size).toBe(0);
      expect(sent[1].clientReportId).toBe(firstId);
      expect(sent[1]).not.toHaveProperty("synced");
    });

    it("drops items the server permanently rejects, keeps items on 5xx", async () => {
      const rejectedId = crypto.randomUUID();
      const store = memoryStore([
        { id: "a", category: "POTHOLES", createdAt: 1, synced: false, clientReportId: rejectedId },
        { id: "b", category: "POTHOLES", createdAt: 2, synced: false, clientReportId: crypto.randomUUID() },
      ]);
      await flushQueue(store, async (body) => ({ ok: false, status: body.clientReportId === rejectedId ? 400 : 503 }));
      expect(Array.from(store.map.keys())).toEqual(["b"]);
    });

    it("no network call happens inside an IndexedDB transaction any more", () => {
      const hook = src("src/hooks/useOfflineSync.ts");
      expect(hook).not.toMatch(/db\.transaction\(STORE_NAME, 'readwrite'\)/);
    });

    it("a resubmitted clientReportId returns the stored report (200) without storing or scoring again", async () => {
      citizenSession("qa-fix-owner");
      const clientReportId = crypto.randomUUID();
      vi.spyOn(prisma.report, "findUnique").mockResolvedValue({
        id: "stored-report",
        userId: "qa-fix-owner",
        role: "REPORT",
        issue: { id: "stored-issue" },
      } as never);
      const create = vi.spyOn(prisma.report, "create");

      const res = await postReport(signedBody({ clientReportId }));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toMatchObject({ alreadyStored: true, pointsEarned: 0, issue: { id: "stored-issue" } });
      expect(create).not.toHaveBeenCalled();
    });

    it("a clientReportId owned by someone else is refused", async () => {
      citizenSession("qa-fix-other");
      vi.spyOn(prisma.report, "findUnique").mockResolvedValue({
        id: "r", userId: "someone-else", role: "REPORT", issue: { id: "i" },
      } as never);
      const res = await postReport(signedBody({ clientReportId: crypto.randomUUID() }));
      expect(res.status).toBe(409);
    });
  });

  describe("7–8. Audit quorum and eligibility", () => {
    it("no decision without two independent voters; one person's repeated votes count once", () => {
      const one = evaluateAuditDecision({
        kind: "CLAIM_CHECK",
        issueStatus: "CLAIMED_FIXED",
        votes: [{ userId: "a", observed: "DAMAGED", weight: 5 }],
      });
      expect(one.decision).toBeNull();
      const same = evaluateAuditDecision({
        kind: "DURABILITY",
        issueStatus: "VERIFIED_FIXED",
        votes: [
          { userId: "a", observed: "DAMAGED", weight: 1 },
          { userId: "a", observed: "DAMAGED", weight: 1 },
        ],
      });
      expect(same.decision).toBeNull();
      const two = evaluateAuditDecision({
        kind: "DURABILITY",
        issueStatus: "VERIFIED_FIXED",
        votes: [
          { userId: "a", observed: "DAMAGED", weight: 0.6 },
          { userId: "b", observed: "DAMAGED", weight: 0.6 },
        ],
      });
      expect(two.decision).toBe("REOPEN_IN_WARRANTY");
    });

    it("accounts younger than 24 h and desk accounts are not eligible", () => {
      const fresh = accountAuditEligibility({ role: "CITIZEN", createdAt: new Date(Date.now() - 3600_000) });
      expect(fresh).toMatchObject({ eligible: false, reason: "ACCOUNT_TOO_NEW" });
      expect(accountAuditEligibility({ role: "AUTHORITY", createdAt: new Date(0) })).toMatchObject({ eligible: false });
      expect(accountAuditEligibility({ role: "CITIZEN", createdAt: new Date(0) })).toEqual({ eligible: true });
    });

    it("a new account gets 'not eligible yet' and no tasks (so no challenge nonces)", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({ role: "CITIZEN", createdAt: new Date() } as never);
      const findTasks = vi.spyOn(prisma.auditTask, "findMany");
      const listing = await listAuditTasksForUser("new-user");
      expect(listing).toMatchObject({ eligible: false, reason: "ACCOUNT_TOO_NEW", tasks: [] });
      expect(listing.message).toMatch(/Not eligible yet/);
      expect(findTasks).not.toHaveBeenCalled();
    });

    it("eligible users never see their own issue, an issue they voted on, or two tasks for one issue", async () => {
      const old = new Date(Date.now() - 72 * 3600_000);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({ role: "CITIZEN", createdAt: old } as never);
      const task = (id: string, issueId: string, reporter: string) => ({
        id,
        issueId,
        kind: "CLAIM_CHECK",
        challengeBearingDeg: 10,
        challengeNonce: `nonce-${id}`,
        dueAt: new Date(Date.now() + 3600_000),
        status: "OPEN",
        issue: { id: issueId, lat: 12.9, lng: 77.6, address: null, repairClaimedAt: old, createdAt: old, reports: [{ userId: reporter }] },
      });
      vi.spyOn(prisma.auditTask, "findMany").mockResolvedValue([
        task("t1", "issue-mine", "me"),
        task("t2", "issue-voted", "other"),
        task("t3", "issue-open", "other"),
        task("t4", "issue-open", "other"), // duplicate open task for the same round
      ] as never);
      vi.spyOn(prisma.auditVote, "findMany").mockResolvedValue([
        { createdAt: new Date(), task: { issueId: "issue-voted", kind: "CLAIM_CHECK" } },
      ] as never);

      const listing = await listAuditTasksForUser("me");
      expect(listing.eligible).toBe(true);
      expect(listing.tasks.map((t) => t.id)).toEqual(["t3"]);
    });

    it("the audit page shows the not-eligible message", () => {
      expect(src("src/app/citizen/audit/page.tsx")).toMatch(/audit-not-eligible[\s\S]*Not eligible yet/);
    });
  });

  describe("9. Input limits", () => {
    it("descriptions over 1,000 characters are refused with a readable message", async () => {
      citizenSession();
      const res = await postReport(signedBody({ note: "x".repeat(TEXT_LIMITS.description + 1) }));
      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toBe("Description must be 1000 characters or fewer");
    });

    it("the report form caps the description and shows a counter", () => {
      const page = src("src/app/citizen/report/page.tsx");
      expect(page).toMatch(/maxLength=\{TEXT_LIMITS\.description\}/);
      expect(page).toMatch(/note-counter/);
      expect(src("src/app/api/reports/[id]/comments/route.ts")).toMatch(/TEXT_LIMITS\.comment/);
      expect(src("src/app/api/issues/[id]/actions/route.ts")).toMatch(/TEXT_LIMITS\.actionNote/);
    });
  });

  describe("10. Claim gap exposes no emails", () => {
    it("desk names are display names only", () => {
      expect(deskDisplayName({ email: "desk-a@civicpulse.local", name: "x" })).toBe("Desk A");
      expect(deskDisplayName({ email: "officer@bbmp.gov.in", name: null })).toBe("Desk Officer");
      expect(deskDisplayName({ email: "o@x.in", name: "o@x.in" })).toBe("Desk Officer");
      expect(actorDisplayName("u1", { role: "CITIZEN", name: "Priya Sharma" })).toBe("Priya S.");
    });

    it("/api/claim-gap and the page loader contain no '@'", async () => {
      const data = await loadClaimGapData(30);
      expect(JSON.stringify(data)).not.toMatch(/@/);
      const res = await claimGapGET(new Request("http://localhost:3000/api/claim-gap?days=90"));
      expect(res.status).toBe(200);
      expect(await res.text()).not.toMatch(/@/);
    });
  });

  describe("11. Stability", () => {
    it("missing or placeholder data renders as text, never throws", () => {
      expect(displayLocation(null, null, undefined)).toBe("Near ?, ?");
      expect(isPlaceholderAddress("report location (12.9, 77.5)")).toBe(true);
      expect(issueTitle("POTHOLES", "Report Location (12.9250, 77.5938)", 12.925, 77.5938)).toBe(
        "Potholes — Near 12.9250, 77.5938"
      );
      expect(issueTitle(null, "MG Road", 1, 2)).toBe("Other — MG Road");
    });

    it("a section that throws shows a friendly fallback instead of crashing the page", () => {
      expect(SectionBoundary.getDerivedStateFromError()).toEqual({ failed: true });
      const boundary = new SectionBoundary({ title: "Live traffic", children: null });
      boundary.state = { failed: true };
      const out = boundary.render() as { props: { children: unknown[] } };
      const text = JSON.stringify(out.props.children);
      expect(text).toContain("Live traffic");
      expect(text).toMatch(/is unavailable right now/);
    });

    it("traffic, AI and repair-window sections are wrapped in boundaries; error pages exist", () => {
      const issuePage = src("src/app/(public)/issue/[id]/page.tsx");
      for (const title of ["Live traffic", "AI assessment", "Repair window"]) {
        expect(issuePage).toContain(`<SectionBoundary title="${title}">`);
      }
      expect(fs.existsSync(path.join(process.cwd(), "src/app/error.tsx"))).toBe(true);
      const globalError = src("src/app/global-error.tsx");
      expect(globalError).toMatch(/<html lang="en">/);
      expect(globalError).toMatch(/<title>/);
    });
  });

  describe("12–18. UX and correctness", () => {
    it("sidebar SIGN OUT calls signOut directly (no NextAuth confirm page)", () => {
      const sidebar = src("src/components/layout/AppSidebar.tsx");
      expect(sidebar).toMatch(/signOut\(\{ callbackUrl: '\/login' \}\)/);
      expect(sidebar).not.toMatch(/action="\/api\/auth\/signout"/);
    });

    it("outside the service area the API answers in plain words", async () => {
      citizenSession();
      const res = await postReport(signedBody({}, { lat: 51.5, lng: -0.12 }));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toMatchObject({ code: "OUT_OF_SERVICE_AREA", message: SERVICE_AREA_MESSAGE });
      expect(isInServiceArea(51.5, -0.12)).toBe(false);
      expect(isInServiceArea(12.95, 77.7)).toBe(true);
    });

    it("a merged report tells the citizen and the dashboard lists each issue once", () => {
      expect(src("src/app/api/reports/route.ts")).toMatch(/Added to an existing report nearby/);
      expect(src("src/app/citizen/report/page.tsx")).toMatch(/\?merged=1/);
      expect(src("src/app/citizen/report/[id]/page.tsx")).toMatch(/merged-notice[\s\S]*Added to an existing report nearby/);
      const deduped = latestReportPerIssue([
        { id: "r9", issueId: "i1" },
        { id: "r2", issueId: "i2" },
        { id: "r1", issueId: "i1" },
      ]);
      expect(deduped.map((r) => r.id)).toEqual(["r9", "r2"]);
    });

    it("confirmations exclude the reporter; votes cast counts real votes only", async () => {
      const count = vi.spyOn(prisma.report, "count").mockResolvedValue(0);
      await countIndependentConfirmations("issue-1", "reporter-1");
      expect(count.mock.calls[0][0]).toMatchObject({
        where: { issueId: "issue-1", role: "CONFIRM", userId: { not: "reporter-1" } },
      });
      const stats = src("src/lib/citizen/stats.ts");
      expect(stats).toMatch(/auditVote\.count/);
      expect(stats).toMatch(/verification\.count/);
    });

    it("priority is shown as an index out of 100, never 3170%", () => {
      const page = src("src/app/citizen/report/[id]/page.tsx");
      expect(page).not.toMatch(/priority \* 100/);
      expect(formatPriority(31.7).scoreFormatted).toBe("31.7");
    });

    it("profile shows tier, reputation and a leaderboard with display names", () => {
      const page = src("src/app/citizen/profile/page.tsx");
      for (const id of ["profile-tier", "profile-reputation", "leaderboard"]) expect(page).toContain(id);
      expect(nextTierProgress(150)).toMatchObject({ tier: "CITIZEN", next: "CONTRIBUTOR", pointsToNext: 50, pct: 75 });
      expect(nextTierProgress(1200)).toMatchObject({ tier: "AMBASSADOR", next: null });
      expect(publicDisplayName("qa@civicpulse.qa")).toBe("qa");
      expect(publicDisplayName(null)).toBe("Citizen");
    });

    it("hydration: login reads sign-up mode from search params and dates use the IST helper", () => {
      expect(isSignUpRequested({ signup: "true" })).toBe(true);
      expect(isSignUpRequested({})).toBe(false);
      expect(src("src/app/(auth)/login/page.tsx")).not.toMatch(/window\.location\.search/);
      const tracker = src("src/components/citizen/StatusTracker.tsx");
      expect(tracker).toMatch(/formatDateTimeIST/);
      expect(tracker).not.toMatch(/import \{[^}]*\bformat\b[^}]*\} from 'date-fns'/);
    });

    it("road timeline is linked from issue pages; the draft survives Back", () => {
      expect(src("src/app/(public)/issue/[id]/page.tsx")).toMatch(/road-timeline-link/);
      expect(src("src/app/citizen/report/[id]/page.tsx")).toMatch(/road-timeline-link/);
      expect(src("src/app/citizen/report/page.tsx")).toMatch(/sessionStorage\.setItem\(DRAFT_KEY/);
    });

    it("a citizen on /desk sees 'Desk access only', not the login form", async () => {
      citizenSession();
      const el = (await DeskLayout({ children: null })) as { type: unknown };
      expect(el.type).toBe(DeskAccessOnly);
    });
  });

  describe("19. Accessibility", () => {
    it("zoom is allowed and icon buttons have labels", () => {
      expect(src("src/app/layout.tsx")).not.toMatch(/maximumScale|userScalable/);
      expect(src("src/app/(auth)/login/page.tsx")).toMatch(/aria-label=\{showPw \? 'Hide password' : 'Show password'\}/);
      expect(src("src/components/ui/RefreshButton.tsx")).toMatch(/aria-label="Refresh"/);
    });
  });
});
