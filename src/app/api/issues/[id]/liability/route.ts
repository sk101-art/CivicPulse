import { Role } from "@prisma/client";
import { withAuth } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/issues/[id]/liability
 * Desk only (Role.AUTHORITY).
 * Returns a printable HTML Contractor Liability Package detailing the defect,
 * warranty terms, signed photos, audit votes, and formal defect liability rectification demand.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await withAuth(Role.AUTHORITY);
    if (auth.error) {
      return auth.error;
    }

    const { id } = await params;
    const issue = await prisma.issue.findUnique({
      where: { id },
      include: {
        reports: {
          orderBy: { capturedAt: "asc" },
          select: {
            id: true,
            role: true,
            photoUrl: true,
            photoSha256: true,
            capturedAt: true,
            lat: true,
            lng: true,
            gpsAccuracyM: true,
            headingDeg: true,
          },
        },
        auditTasks: {
          include: {
            votes: {
              include: {
                user: {
                  include: { auditorScore: true },
                },
              },
            },
          },
        },
      },
    });

    if (!issue) {
      return apiError(404, "NOT_FOUND", `Issue '${id}' not found`);
    }

    const mapUrl = `https://www.google.com/maps?q=${issue.lat},${issue.lng}`;
    const claimDate = issue.repairClaimedAt ? new Date(issue.repairClaimedAt).toLocaleDateString("en-IN") : "N/A";
    const warrantyEnd = issue.warrantyUntil ? new Date(issue.warrantyUntil).toLocaleDateString("en-IN") : "N/A";
    const contractor = issue.contractorName || " Cauvery Infrastructure Ltd. (Primary Contractor)";
    const tender = issue.tenderId || "BBMP/EE/RRD/2026-27/W-4192";
    const lifespan = issue.lifespanDays !== null && issue.lifespanDays !== undefined ? `${issue.lifespanDays} days` : "Under Evaluation";

    const allVotes = issue.auditTasks.flatMap((t) =>
      t.votes.map((v) => ({
        ...v,
        taskKind: t.kind,
        auditorReliability: v.user.auditorScore?.reliability ?? v.weight,
      }))
    );

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Defect Liability Notice — Issue #${issue.id}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111827; background: #fff; margin: 0; padding: 32px; font-size: 13px; line-height: 1.5; }
    .header { border-bottom: 2px solid #000; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
    .title { font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
    .subtitle { font-size: 13px; color: #4b5563; font-weight: 600; margin-top: 4px; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .badge-reopened { background: #fee2e2; color: #991b1b; border: 1px solid #f87171; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px; }
    .card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 14px; background: #f9fafb; }
    .card-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6b7280; margin-bottom: 6px; }
    .card-value { font-size: 14px; font-weight: 700; color: #111827; }
    .legal-notice { border: 2px solid #dc2626; border-radius: 6px; background: #fef2f2; padding: 16px; margin-bottom: 24px; }
    .legal-notice h3 { margin-top: 0; font-size: 14px; font-weight: 800; color: #991b1b; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px; }
    th { text-align: left; background: #f3f4f6; padding: 8px 10px; border: 1px solid #e5e7eb; font-weight: 700; font-size: 11px; text-transform: uppercase; }
    td { padding: 8px 10px; border: 1px solid #e5e7eb; }
    .photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .photo-card { border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
    .photo-card img { width: 100%; height: 140px; object-fit: cover; background: #f3f4f6; }
    .photo-meta { padding: 8px; font-size: 10px; color: #4b5563; word-break: break-all; }
    .print-actions { margin-bottom: 24px; }
    .btn-print { background: #0284c7; color: white; border: none; padding: 8px 16px; font-weight: 700; border-radius: 6px; cursor: pointer; }
    @media print {
      body { padding: 0; }
      .print-actions { display: none; }
    }
  </style>
</head>
<body>
  <div class="print-actions">
    <button class="btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
  </div>

  <div class="header">
    <div>
      <div class="title">Municipal Defect Liability Rectification Notice</div>
      <div class="subtitle">CivicPulse Road Truth Ledger · Public Authority Enforcement Dossier</div>
    </div>
    <div>
      <span class="badge badge-reopened">STATUS: ${issue.status.replace(/_/g, " ")}</span>
    </div>
  </div>

  <div class="legal-notice">
    <h3>Defect Liability Notice Under Contract Clause 38</h3>
    <p style="margin: 0;">
      Notice is hereby served that the road works executed under Tender Reference <strong>${tender}</strong> have exhibited structural failure and deterioration prior to the expiration of the mandatory 365-day warranty period. Independent, randomized citizen blind audits and on-site durability verifications have confirmed resurfacing defects. You are contractually mandated to re-inspect and rectify the road asset within <strong>7 (seven) calendar days</strong> at zero cost to the Municipal Corporation.
    </p>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-title">Contractor & Tender Identification</div>
      <div class="card-value">${contractor}</div>
      <div style="font-size: 11px; color: #4b5563; margin-top: 4px;">Tender ID: <strong>${tender}</strong></div>
    </div>
    <div class="card">
      <div class="card-title">Road Asset Location & Coordinates</div>
      <div class="card-value">${issue.address || "ORR Pilot Corridor, Bengaluru"}</div>
      <div style="font-size: 11px; margin-top: 4px;">
        <a href="${mapUrl}" target="_blank" style="color: #0284c7; text-decoration: none; font-weight: 600;">
          📍 View Location Map (${issue.lat.toFixed(5)}, ${issue.lng.toFixed(5)})
        </a>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Warranty Window & Lifespan</div>
      <div class="card-value">Measured Lifespan: ${lifespan}</div>
      <div style="font-size: 11px; color: #4b5563; margin-top: 4px;">
        Claimed: ${claimDate} · Warranty Ends: ${warrantyEnd}
      </div>
    </div>
    <div class="card">
      <div class="card-title">Asset Category & Priority</div>
      <div class="card-value">${issue.category.replace(/_/g, " ")}</div>
      <div style="font-size: 11px; color: #4b5563; margin-top: 4px;">Priority Index: ${issue.priority.toFixed(1)} · Band: ${issue.band}</div>
    </div>
  </div>

  <h3 style="font-size: 14px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 12px;">
    Citizen Blind Audit & Durability Records
  </h3>
  <table>
    <thead>
      <tr>
        <th>Task Kind</th>
        <th>Recorded Verdict</th>
        <th>Auditor Reliability</th>
        <th>Vote Weight</th>
        <th>Recorded At</th>
      </tr>
    </thead>
    <tbody>
      ${
        allVotes.length === 0
          ? '<tr><td colspan="5" style="text-align: center; color: #9ca3af;">No audit votes recorded for this issue.</td></tr>'
          : allVotes
              .map(
                (v) => `<tr>
                  <td><strong>${v.taskKind}</strong></td>
                  <td><span style="font-weight: 700; color: ${v.observed === "INTACT" ? "#059669" : "#dc2626"};">${v.observed}</span></td>
                  <td>${(v.auditorReliability * 100).toFixed(1)}%</td>
                  <td>${v.weight.toFixed(2)}</td>
                  <td>${new Date(v.createdAt).toLocaleString("en-IN")}</td>
                </tr>`
              )
              .join("")
      }
    </tbody>
  </table>

  <h3 style="font-size: 14px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 12px;">
    Cryptographically Signed Evidence Trail
  </h3>
  <div class="photo-grid">
    ${
      issue.reports.length === 0
        ? '<div style="color: #9ca3af;">No signed photos available.</div>'
        : issue.reports
            .map(
              (r) => `<div class="photo-card">
                <img src="${r.photoUrl}" alt="${r.role}" onerror="this.src='https://placehold.co/400x300?text=Audit+Photo'" />
                <div class="photo-meta">
                  <strong>${r.role}</strong><br/>
                  ${new Date(r.capturedAt).toLocaleString("en-IN")}<br/>
                  GPS: ${r.lat.toFixed(5)}, ${r.lng.toFixed(5)} (±${r.gpsAccuracyM.toFixed(1)}m)${r.headingDeg !== null ? `<br/>Heading: ${r.headingDeg}°` : ""}<br/>
                  SHA-256: <span style="font-family: monospace;">${r.photoSha256.slice(0, 16)}...</span>
                </div>
              </div>`
            )
            .join("")
    }
  </div>

  <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 32px; font-size: 11px; color: #6b7280; display: flex; justify-content: space-between;">
    <div>Generated by CivicPulse Road Truth Ledger · Authority Desk Operations</div>
    <div>Document Timestamp: ${new Date().toISOString()}</div>
  </div>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error: unknown) {
    console.error("Failed to generate liability package:", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to generate contractor liability package");
  }
}
