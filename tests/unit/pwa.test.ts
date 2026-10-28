import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("T70 Unit Test: Installable PWA Manifest and Service Worker", () => {
  const rootDir = process.cwd();
  const manifestPath = path.join(rootDir, "public", "manifest.json");
  const swPath = path.join(rootDir, "public", "sw.js");
  const offlinePath = path.join(rootDir, "public", "offline.html");
  const icon192Path = path.join(rootDir, "public", "icons", "icon-192x192.png");
  const icon512Path = path.join(rootDir, "public", "icons", "icon-512x512.png");

  it("manifest.json exists and satisfies PWA installability requirements", () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const content = fs.readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(content);

    expect(manifest.name).toBe("CivicPulse - Municipal Road Truth Ledger");
    expect(manifest.short_name).toBe("CivicPulse");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#0D1117");
    expect(manifest.background_color).toBe("#020617");

    // Icons
    expect(Array.isArray(manifest.icons)).toBe(true);
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("icon image files exist on disk with valid file size", () => {
    expect(fs.existsSync(icon192Path)).toBe(true);
    expect(fs.statSync(icon192Path).size).toBeGreaterThan(500);

    expect(fs.existsSync(icon512Path)).toBe(true);
    expect(fs.statSync(icon512Path).size).toBeGreaterThan(1000);
  });

  it("service worker public/sw.js exists with lifecycle and offline caching handlers", () => {
    expect(fs.existsSync(swPath)).toBe(true);
    const swContent = fs.readFileSync(swPath, "utf-8");

    // Lifecycle events
    expect(swContent).toContain("addEventListener('install'");
    expect(swContent).toContain("addEventListener('activate'");
    expect(swContent).toContain("addEventListener('fetch'");

    // Pre-cached assets & offline fallback
    expect(swContent).toContain("offline.html");
    expect(swContent).toContain("manifest.json");
    expect(swContent).toContain("skipWaiting");
    expect(swContent).toContain("clients.claim");
  });

  it("offline fallback page exists and contains user guidance", () => {
    expect(fs.existsSync(offlinePath)).toBe(true);
    const html = fs.readFileSync(offlinePath, "utf-8");
    expect(html).toContain("No Internet Connection");
    expect(html).toContain("offline");
  });
});
