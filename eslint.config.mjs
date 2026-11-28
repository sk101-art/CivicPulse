import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Test fixtures and one-off maintenance tools frequently cross Prisma's
    // generated types; keep application source held to the stricter rule.
    files: ["tests/**/*.{js,ts,tsx}", "scripts/**/*.{js,ts,tsx}"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    // These standalone scripts are CommonJS by design and are run directly by Node.
    files: ["scripts/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // Leaflet must load only in browser callbacks in these client map components.
    files: [
      "src/components/citizen/IssuesNearMeMap.tsx",
      "src/components/desk/RouteOptimizerView.tsx",
      "src/components/intelligence/GeoIntelligenceMap.tsx",
    ],
    rules: { "@typescript-eslint/no-require-imports": ["error", { allow: ["leaflet"] }] },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".agent/**",
    ".agents/**",
    "tests/e2e/legacy/**",
  ]),
]);

export default eslintConfig;
