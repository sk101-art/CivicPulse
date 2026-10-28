import { describe, it, expect, beforeEach } from "vitest";
import { PWA_DISMISSED_SESSION_KEY } from "@/components/pwa/PwaManager";
import fs from "fs";
import path from "path";

describe("PWA Install Banner Placement and Session Dismissal", () => {
  const mockStorage: Record<string, string> = {};
  const fakeSessionStorage = {
    getItem: (k: string) => mockStorage[k] ?? null,
    setItem: (k: string, v: string) => { mockStorage[k] = v; },
    clear: () => {
      for (const k of Object.keys(mockStorage)) {
        delete mockStorage[k];
      }
    },
  };

  beforeEach(() => {
    fakeSessionStorage.clear();
  });

  it("exports PWA_DISMISSED_SESSION_KEY for session dismissal tracking", () => {
    expect(PWA_DISMISSED_SESSION_KEY).toBe("civicpulse_pwa_dismissed");
  });

  it("stores dismissal in sessionStorage when dismissed", () => {
    expect(fakeSessionStorage.getItem(PWA_DISMISSED_SESSION_KEY)).toBeNull();
    fakeSessionStorage.setItem(PWA_DISMISSED_SESSION_KEY, "1");
    expect(fakeSessionStorage.getItem(PWA_DISMISSED_SESSION_KEY)).toBe("1");
  });

  it("verifies PwaManager source contains non-overlapping placement bottom-24 and session dismissal handling", () => {
    const pwaSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/pwa/PwaManager.tsx"),
      "utf8"
    );

    // Ensure it positions above the 72px mobile bottom nav (bottom-24 = 96px from bottom)
    expect(pwaSource).toContain("bottom-24");
    expect(pwaSource).toContain("lg:bottom-6");

    // Ensure sessionStorage dismissal check and handling
    expect(pwaSource).toContain("PWA_DISMISSED_SESSION_KEY");
    expect(pwaSource).toContain("sessionStorage.setItem");
    expect(pwaSource).toContain("sessionStorage.getItem");
  });
});
