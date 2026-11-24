import { describe, it, expect } from "vitest";
import { PWA_DISMISSED_SESSION_KEY, PwaManager } from "@/components/pwa/PwaManager";
import fs from "fs";
import path from "path";

describe("PWA Installation in Settings & Floating Popup Removal", () => {
  it("exports PWA_DISMISSED_SESSION_KEY for backward compatibility", () => {
    expect(PWA_DISMISSED_SESSION_KEY).toBe("civicpulse_pwa_dismissed");
  });

  it("verifies PwaManager does not render any floating install banner or popup", () => {
    const pwaSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/pwa/PwaManager.tsx"),
      "utf8"
    );

    // Ensure floating popup classes and buttons are removed
    expect(pwaSource).not.toContain("data-testid=\"pwa-install-banner\"");
    expect(pwaSource).not.toContain("bg-slate-900");
    expect(pwaSource).not.toContain("Later");

    // Returns null to prevent disruptive prompts
    expect(pwaSource).toContain("return null");
  });

  it("verifies AppInstallationCard is implemented as a Settings card following Civic Atlas design system", () => {
    const cardSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/settings/AppInstallationCard.tsx"),
      "utf8"
    );

    expect(cardSource).toContain("APP INSTALLATION");
    expect(cardSource).toContain("Install CivicPulse");
    expect(cardSource).toContain("Install App");
    expect(cardSource).toContain("To install CivicPulse on iOS");
    expect(cardSource).toContain("#355858"); // Civic Atlas Deep Teal
    expect(cardSource).toContain("#527B7A"); // Desaturated Teal
  });

  it("verifies PwaContext provides centralized installation and event handling", () => {
    const contextSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/context/PwaContext.tsx"),
      "utf8"
    );

    expect(contextSource).toContain("beforeinstallprompt");
    expect(contextSource).toContain("appinstalled");
    expect(contextSource).toContain("e.preventDefault()");
    expect(contextSource).toContain("display-mode: standalone");
  });
});
