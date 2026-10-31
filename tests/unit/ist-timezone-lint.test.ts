import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("IST Timezone Enforcement (Lint Guard)", () => {
  const srcDir = path.resolve(__dirname, "../../src");

  function getFiles(dir: string, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        getFiles(fullPath, fileList);
      } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
        fileList.push(fullPath);
      }
    }
    return fileList;
  }

  it("ensures no direct getHours(), getDay(), getUTCHours(), or getUTCDay() calls exist outside src/lib/time/ist.ts", () => {
    const allFiles = getFiles(srcDir);
    const forbiddenPattern = /\.(getHours|getDay|getUTCHours|getUTCDay)\s*\(/;

    const violations: { file: string; line: number; match: string }[] = [];

    for (const filePath of allFiles) {
      // Allow src/lib/time/ist.ts to define the base implementation
      const relativePath = path.relative(srcDir, filePath).replace(/\\/g, "/");
      if (relativePath === "lib/time/ist.ts") {
        continue;
      }

      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      lines.forEach((lineText, idx) => {
        if (forbiddenPattern.test(lineText)) {
          violations.push({
            file: relativePath,
            line: idx + 1,
            match: lineText.trim(),
          });
        }
      });
    }

    expect(
      violations,
      `Forbidden direct timezone/hour methods found. Use helpers from '@/lib/time/ist' instead:\n` +
        violations.map((v) => `  ${v.file}:${v.line} -> ${v.match}`).join("\n")
    ).toEqual([]);
  });
});
