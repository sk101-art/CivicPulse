/**
 * Fires N concurrent GET requests at one issue page and reports status codes, latency and errors.
 * Meant for a Vercel PREVIEW deployment (it refuses the production domain unless explicitly allowed).
 *
 * Usage:
 *   npx tsx scripts/load-issue-page.ts <preview-base-url> <issueId> [--n=50] [--path=/issue/<id>]
 *   npx tsx scripts/load-issue-page.ts https://civic-pulse-git-v2-xyz.vercel.app seed-demo-critical-bellandur
 *
 * Exit code 1 when any request failed (non-2xx, network error, or a pooler error in the body).
 */

const PRODUCTION_HOSTS = ["civic-pulse-cyan-ten.vercel.app"];
const POOLER_ERROR = /EMAXCONN|max clients reached|too many connections|remaining connection slots/i;

export interface LoadResult {
  status: number | null;
  ms: number;
  error?: string;
}

export function parseArgs(argv: string[]) {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const flag = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  const [base, issueId] = positional;
  const n = Number(flag("n") ?? 50);
  return {
    base,
    issueId,
    n: Number.isInteger(n) && n > 0 ? n : 50,
    path: flag("path"),
    allowProduction: argv.includes("--allow-production"),
  };
}

export function assertNotProduction(baseUrl: string, allowProduction: boolean) {
  const host = new URL(baseUrl).hostname;
  if (PRODUCTION_HOSTS.includes(host) && !allowProduction) {
    throw new Error(
      `Refusing to load-test the production domain (${host}). Use a preview deployment URL, ` +
        "or pass --allow-production if you really mean it."
    );
  }
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export function summarize(results: LoadResult[]) {
  const byStatus = new Map<string, number>();
  for (const r of results) {
    const key = r.status === null ? "network-error" : String(r.status);
    byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
  }
  const failed = results.filter((r) => r.status === null || r.status >= 400 || r.error);
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  return {
    total: results.length,
    ok: results.length - failed.length,
    failed: failed.length,
    byStatus: Object.fromEntries(byStatus),
    p50: percentile(ms, 50),
    p95: percentile(ms, 95),
    max: ms[ms.length - 1] ?? 0,
    errors: Array.from(new Set(failed.map((f) => f.error ?? `HTTP ${f.status}`))).slice(0, 10),
  };
}

async function hit(url: string): Promise<LoadResult> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: { "cache-control": "no-cache" }, signal: AbortSignal.timeout(60000) });
    const body = await res.text();
    const poolerError = POOLER_ERROR.exec(body)?.[0];
    return {
      status: res.status,
      ms: Date.now() - t0,
      error: poolerError ? `pooler error in body: ${poolerError}` : res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    return { status: null, ms: Date.now() - t0, error: (err as Error).message.split("\n")[0] };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.base || !args.issueId) {
    console.error("Usage: npx tsx scripts/load-issue-page.ts <preview-base-url> <issueId> [--n=50]");
    process.exit(2);
  }
  assertNotProduction(args.base, args.allowProduction);
  const url = new URL(args.path ?? `/issue/${encodeURIComponent(args.issueId)}`, args.base).toString();

  console.log(`Firing ${args.n} concurrent requests at ${url}`);
  const results = await Promise.all(Array.from({ length: args.n }, () => hit(url)));
  const s = summarize(results);
  console.log(`ok ${s.ok}/${s.total}  failed ${s.failed}`);
  console.log(`status counts: ${JSON.stringify(s.byStatus)}`);
  console.log(`latency ms: p50 ${s.p50}  p95 ${s.p95}  max ${s.max}`);
  if (s.errors.length) console.log(`errors:\n  - ${s.errors.join("\n  - ")}`);
  process.exit(s.failed > 0 ? 1 : 0);
}

if (process.argv[1] && /load-issue-page\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
