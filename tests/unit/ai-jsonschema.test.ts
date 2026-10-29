import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Constraint 3: Every runAi call must pass jsonSchema", () => {
  it("verifies that all runAi calls across the codebase include jsonSchema", () => {
    const srcDir = path.resolve(__dirname, "../../src");

    function getAllFiles(dir: string, fileList: string[] = []): string[] {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
          getAllFiles(filePath, fileList);
        } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
          fileList.push(filePath);
        }
      }
      return fileList;
    }

    const allFiles = getAllFiles(srcDir);
    const filesWithRunAi = allFiles.filter((f) => {
      // Exclude run.ts itself and test files
      if (f.endsWith("run.ts") || f.includes("__tests__")) return false;
      const content = fs.readFileSync(f, "utf-8");
      return content.includes("runAi(") || content.includes("runAi<");
    });

    expect(filesWithRunAi.length).toBeGreaterThan(0);

    const violations: Array<{ file: string; match: string }> = [];

    for (const file of filesWithRunAi) {
      const content = fs.readFileSync(file, "utf-8");
      // Find all runAi blocks
      const regex = /runAi(?:<[^>]+>)?\s*\(\s*\{([\s\S]*?)\}\s*\)/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        const callBody = match[1];
        if (!callBody.includes("jsonSchema")) {
          violations.push({
            file: path.relative(srcDir, file),
            match: match[0].slice(0, 100),
          });
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
