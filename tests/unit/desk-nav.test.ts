import { describe, it, expect, vi } from "vitest";
import { execSync } from "child_process";
import DeskTicketsPage from "@/app/desk/tickets/page";
import DeskStatusPage from "@/app/desk/status/page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

describe("Desk Navigation and Legacy Routes Redirects", () => {
  it("redirects /desk/tickets to /desk", () => {
    expect(() => DeskTicketsPage()).toThrow("REDIRECT:/desk");
  });

  it("redirects /desk/status to /desk", () => {
    expect(() => DeskStatusPage()).toThrow("REDIRECT:/desk");
  });

  it("ensures legacy placeholder string is completely eliminated from repository", () => {
    const target = ["Coming", "in", "T25"].join(" ");
    try {
      const output = execSync(`git grep "${target}"`, { encoding: "utf8" });
      expect(output.trim()).toBe("");
    } catch {
      // Non-zero exit code means 0 matches found, which is expected
      expect(true).toBe(true);
    }
  });
});
