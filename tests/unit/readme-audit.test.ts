import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("T72 Acceptance Test: Security & Framing Audit", () => {
  const rootDir = process.cwd();
  const readmePath = path.join(rootDir, "README.md");

  it("README.md exists and contains the architecture diagram, data sources, and truth ledger framing", () => {
    expect(fs.existsSync(readmePath)).toBe(true);
    const content = fs.readFileSync(readmePath, "utf-8");

    expect(content).toContain("Municipal Road Truth Ledger");
    expect(content).toContain("```mermaid");
    expect(content).toContain("OpenStreetMap");
    expect(content).toContain("Open-Meteo");
    expect(content).toContain("OpenCity");
  });

  it("README.md documents every environment variable defined in the server schema", () => {
    const content = fs.readFileSync(readmePath, "utf-8");
    const requiredEnvVars = [
      "APP_DATABASE_URL",
      "DIRECT_DATABASE_URL",
      "NEXTAUTH_URL",
      "NEXTAUTH_SECRET",
      "SEED_DESK_PASSWORD",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_EVIDENCE_BUCKET",
      "TOMTOM_API_KEY",
      "GEMINI_API_KEY",
      "GEMINI_MODEL",
      "GROQ_API_KEY",
      "GROQ_MODEL_VISION",
      "GROQ_MODEL_TEXT",
      "AI_DAILY_CALL_CAP",
      "AI_FEATURES",
      "REDDIT_CLIENT_ID",
      "REDDIT_CLIENT_SECRET",
      "REDDIT_USER_AGENT",
      "APP_REGION",
      "VAPID_PRIVATE_KEY",
      "VAPID_SUBJECT",
      "JOB_SECRET",
      "APP_TIMEZONE",
    ];

    for (const v of requiredEnvVars) {
      expect(content).toContain(`\`${v}\``);
    }
  });

  it("Zero occurrences of 'security grid' in src/ codebase", () => {
    function searchDir(dir: string): string[] {
      const results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          results.push(...searchDir(fullPath));
        } else if (file.endsWith(".ts") || file.endsWith(".tsx") || file.endsWith(".js") || file.endsWith(".json")) {
          const fileContent = fs.readFileSync(fullPath, "utf-8");
          if (/security\s+grid/i.test(fileContent)) {
            results.push(fullPath);
          }
        }
      }
      return results;
    }

    const matches = searchDir(path.join(rootDir, "src"));
    expect(matches).toEqual([]);
  });
});
