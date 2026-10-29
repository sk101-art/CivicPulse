import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Intercept server-only for standalone script execution
try {
  const serverOnlyPath = require.resolve('server-only');
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
  } as any;
} catch (e) {}

// Load env
const rootDir = process.cwd();
if (fs.existsSync(path.join(rootDir, '.env'))) {
  dotenv.config({ path: path.join(rootDir, '.env') });
}
if (fs.existsSync(path.join(rootDir, '.env.local'))) {
  dotenv.config({ path: path.join(rootDir, '.env.local'), override: true });
}

async function main() {
  console.log('=== Running Production Jobs ===');

  const { runJob } = await import('../src/lib/jobs/runner');
  const { getRepairWindowForIssue } = await import('../src/lib/traffic/repairWindow');
  const { assessIssue } = await import('../src/lib/ai/analyst');
  const { prisma } = await import('../src/lib/db/prisma');

  const { resetDailyTomTomCallCount } = await import('../src/lib/external/tomtom');

  console.log('\n--- 1. Traffic Profile Job ---');
  try {
    // Reset daily TomTom quota tracking for testing so demo issues get TOMTOM_HISTORIC profiles
    await resetDailyTomTomCallCount();
    // Clear demo profiles so they are freshly built with fixed TomTom parameters
    await prisma.placeTrafficProfile.deleteMany({
      where: { issueId: { startsWith: 'seed-demo-' } },
    });
    const tpResult = await runJob('traffic-profile');
    console.log('Traffic Profile Job result:', tpResult);
  } catch (err) {
    console.error('Traffic Profile Job failed:', err);
  }

  console.log('\n--- 2. Insights Job ---');
  try {
    const insightsResult = await runJob('insights');
    console.log('Insights Job result:', insightsResult);
  } catch (err) {
    console.error('Insights Job failed:', err);
  }

  console.log('\n--- 3. AI Assess Job ---');
  try {
    const aiResult = await runJob('ai-assess');
    console.log('AI Assess Job result:', aiResult);
  } catch (err) {
    console.error('AI Assess Job failed:', err);
  }

  console.log('\n=== Inspecting Demo Issues ===');
  const demoIssueIds = [
    'seed-demo-critical-bellandur',
    'seed-demo-medium-cessna',
    'seed-demo-low-agara',
  ];

  for (const id of demoIssueIds) {
    console.log(`\n=================================`);
    console.log(`Issue ID: ${id}`);
    const issue = await prisma.issue.findUnique({
      where: { id },
      include: {
        trafficProfiles: { take: 1 },
      },
    });

    if (!issue) {
      console.log('NOT FOUND in DB');
      continue;
    }

    console.log(`Category: ${issue.category} | Address: ${issue.address}`);
    console.log(`Priority: ${issue.priority}`);
    console.log(`Traffic Profiles Count: ${issue.trafficProfiles.length} | Source: ${issue.trafficProfiles[0]?.source || 'NONE'}`);

    try {
      const windowResult = await getRepairWindowForIssue(id);
      if (windowResult && windowResult.bestWindow) {
        console.log(`\nBest Repair Window:`);
        console.log(`  Window Type: ${windowResult.bestWindow.windowType}`);
        console.log(`  Start (IST): ${windowResult.bestWindow.display}`);
        console.log(`  Start (ISO): ${windowResult.bestWindow.start}`);
        console.log(`  End (ISO):   ${windowResult.bestWindow.end}`);
        console.log(`  Score:       ${windowResult.bestWindow.score}`);
        console.log(`  Factors:    `, windowResult.bestWindow.factors);
        console.log(`  Queue Delay: ${windowResult.bestWindow.laneClosure.estimatedQueueDelayMin}`);
        console.log(`  Explanation: ${windowResult.bestWindow.explanation}`);

        console.log(`\nTop Recommended Windows:`);
        windowResult.windows.forEach((w, idx) => {
          console.log(`  [${idx + 1}] ${w.display} (${w.windowType}) | Score: ${w.score} | Queue: ${w.laneClosure.estimatedQueueDelayMin} | Expected Congestion: ${Math.round(w.expectedCongestion * 100)}%`);
        });
      } else {
        console.log('Repair Window: NONE returned');
      }
    } catch (wErr) {
      console.error('Failed to get repair window:', wErr);
    }

    try {
      const assessment = await assessIssue(id);
      console.log(`\nAI Assessment:`);
      console.log(`  Engine:         ${assessment.engine}`);
      console.log(`  Priority Delta: ${assessment.priorityAdjustmentRecommended}`);
      console.log(`  Summary:        ${assessment.summary}`);
      console.log(`  Reasoning:      ${assessment.reasoning}`);
      console.log(`  Key Risks:     `, assessment.keyRisks);
      console.log(`  Suggested Action: ${assessment.suggestedAction}`);
    } catch (aErr) {
      console.error('Failed to get AI assessment:', aErr);
    }
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
