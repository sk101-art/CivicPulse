import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { deskStatusFilter, CLOSED_STATUSES } from "@/lib/desk/queueFilter";

describe("desk queue status filter", () => {
  it("hides VERIFIED_FIXED and REJECTED by default", () => {
    expect(CLOSED_STATUSES).toEqual(["VERIFIED_FIXED", "REJECTED"]);
    expect(deskStatusFilter(null, false)).toEqual({ notIn: ["VERIFIED_FIXED", "REJECTED"] });
    expect(deskStatusFilter("ALL", false)).toEqual({ notIn: ["VERIFIED_FIXED", "REJECTED"] });
  });

  it("shows everything when includeClosed is set", () => {
    expect(deskStatusFilter(null, true)).toBeUndefined();
    expect(deskStatusFilter("ALL", true)).toBeUndefined();
  });

  it("an explicit status selection wins, so closed statuses can still be filtered to", () => {
    expect(deskStatusFilter("REJECTED", false)).toEqual({ in: ["REJECTED"] });
    expect(deskStatusFilter("OPEN, DISPUTED", false)).toEqual({ in: ["OPEN", "DISPUTED"] });
  });

  it("desk page initial load and queue API both use the default", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "src/app/desk/page.tsx"), "utf-8");
    const api = fs.readFileSync(path.join(process.cwd(), "src/app/api/desk/queue/route.ts"), "utf-8");
    const ui = fs.readFileSync(path.join(process.cwd(), "src/components/desk/DeskQueue.tsx"), "utf-8");
    expect(page).toContain("where: { status: deskStatusFilter(null, false) }");
    expect(api).toContain('deskStatusFilter(statusParam, searchParams.get("includeClosed") === "true")');
    expect(ui).toContain("params.set('includeClosed', 'true')");
  });
});
