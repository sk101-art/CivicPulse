export function getRulesFallback(feature: string, input: unknown): Record<string, unknown> {
  const inp = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;

  switch (feature) {
    case "G1": {
      // Photo triage
      const reportedCategory = typeof inp.category === "string" ? inp.category : "unknown";
      return {
        category: reportedCategory,
        size_class: "unknown",
        lane_position: "unknown",
        water_present: "unknown",
        recapture_suspected: "no",
        faces_or_plates: "no",
        confidence: 0.5,
      };
    }

    case "G2": {
      // Fix-check comparator
      return {
        same_location: "unclear",
        defect_still_visible: "unclear",
        confidence: 0.5,
      };
    }

    case "G3": {
      // Duplicate detection
      return {
        verdict: "unclear",
        confidence: 0.5,
      };
    }

    case "G4": {
      // Signboard OCR extraction
      return {
        agency: null,
        contractor: null,
        work_order: null,
        start_date: null,
        end_date: null,
      };
    }

    case "G5": {
      // Signal extraction from news / Reddit
      return {
        relevant: "no",
        place_text: null,
        category: "unknown",
        happened_at: null,
      };
    }

    case "G6": {
      // Language translation
      const text = typeof inp.text === "string" ? inp.text : (typeof inp.note === "string" ? inp.note : "");
      return {
        language: "English",
        english: text,
      };
    }

    case "G7": {
      // Explainer
      const facts = Array.isArray(inp.facts) ? inp.facts : [];
      const textParts = facts
        .map((f) => (typeof f === "object" && f !== null && "text" in f ? String(f.text) : String(f)))
        .filter(Boolean);
      const factIds = facts
        .map((f) => (typeof f === "object" && f !== null && "id" in f ? String(f.id) : null))
        .filter((id): id is string => Boolean(id));

      return {
        text: textParts.join(". "),
        fact_ids: factIds,
      };
    }

    case "G8": {
      // Moderation
      return {
        abuse: "no",
        personal_info: "no",
        faces_or_plates: "no",
      };
    }

    case "G-ASSESS": {
      const p = typeof inp.priority === "number" ? inp.priority : 50;
      const detScore = typeof inp.deteriorationScore === "number" ? inp.deteriorationScore : 30;
      const category = typeof inp.category === "string" ? inp.category : "Defect";
      const delayRatio = typeof inp.delayRatio === "number" ? inp.delayRatio : 0.15;
      const busPerHour = typeof inp.busesPerHour === "number" ? inp.busesPerHour : 0;
      const rainMm = typeof inp.past7DaysRainMm === "number" ? inp.past7DaysRainMm : 0;

      let adjustment = 0;
      const keyRisks: string[] = [];
      if (detScore >= 70) {
        adjustment += 5;
        keyRisks.push(`High deterioration risk (score ${detScore}/100)`);
      }
      if (busPerHour >= 30) {
        adjustment += 3;
        keyRisks.push(`Heavy bus corridor (${Math.round(busPerHour)} buses/h)`);
      }
      if (rainMm >= 20) {
        keyRisks.push(`Pavement subgrade weakened by ${Math.round(rainMm)} mm rain`);
      }

      adjustment = Math.max(-10, Math.min(10, adjustment));

      return {
        summary: `${category} with priority ${Math.round(p)} and deterioration score ${detScore}/100. Pavement traffic delay is ${Math.round(delayRatio * 100)}% with ${Math.round(busPerHour)} buses/h.`,
        priorityAdjustmentRecommended: adjustment,
        reasoning: adjustment > 0
          ? `Elevated risk due to ${keyRisks.join(" and ")}.`
          : "Standard defect maintenance priority holds.",
        keyRisks: keyRisks.length > 0 ? keyRisks : ["Standard wear and tear"],
        suggestedAction: detScore >= 70
          ? "Schedule immediate patch repair during night window."
          : "Queue for routine ward maintenance.",
      };
    }

    case "G-BRIEF": {
      const wardName = typeof inp.wardName === "string" ? inp.wardName : "Ward";
      const wardCode = typeof inp.wardCode === "string" ? inp.wardCode : "150";
      const openCount = typeof inp.totalOpen === "number" ? inp.totalOpen : typeof inp.openIssuesCount === "number" ? inp.openIssuesCount : 0;
      const rainPast24h = typeof inp.rainPast24hMm === "number" ? inp.rainPast24hMm : 0;
      const highRiskCount = typeof inp.totalHighRisk === "number" ? inp.totalHighRisk : typeof inp.highRiskCount === "number" ? inp.highRiskCount : 0;
      const wardsList = Array.isArray(inp.wards) ? inp.wards : [];

      let briefText: string;
      if (wardsList.length > 0) {
        const parts = wardsList
          .filter((w: Record<string, unknown>) => (w.total as number) > 0)
          .map((w: Record<string, unknown>) => `${w.wardName} (${w.wardCode}): ${w.total} active (${w.highRisk} high risk)`);
        briefText = `Morning brief across active wards: ${parts.join(" · ")}. ${highRiskCount} high-risk defects flagged after ${Math.round(rainPast24h)} mm recent rain. Dispatch repair crews during scheduled dry windows.`;
      } else {
        briefText = `${wardName} (${wardCode}) Morning Brief: ${openCount} open issues. ${highRiskCount} high-risk defects flagged after ${Math.round(rainPast24h)} mm recent rain. Recommended today: dispatch repair crews during the recommended dry night window.`;
      }

      return {
        wardCode,
        wardName: wardsList.length > 0 ? "Bengaluru Pilot Wards" : wardName,
        headline: `${openCount} active issues across pilot corridors`,
        brief: briefText,
        recommendedActions: [
          "Deploy asphalt repair crew to high-risk road corridors.",
          "Inspect drainage outlets before next forecast rain.",
        ],
      };
    }

    case "G-AUDIT-ASSIST": {
      const votes = Array.isArray(inp.votes) ? inp.votes : [];
      let intact = 0;
      let damaged = 0;
      let cannotSee = 0;

      for (const v of votes) {
        const obs = (v && typeof v === "object" && "observed" in v) ? String(v.observed).toUpperCase() : "";
        if (obs === "INTACT") intact++;
        else if (obs === "DAMAGED") damaged++;
        else cannotSee++;
      }

      let recommendation: "ACCEPT_FIX" | "REJECT_FIX" | "DISPATCH_INSPECTOR" = "DISPATCH_INSPECTOR";
      let confidence = 0.6;
      let reasoning = "Inconclusive citizen audit votes. Manual verification required.";

      if (intact >= 2 && damaged === 0) {
        recommendation = "ACCEPT_FIX";
        confidence = 0.9;
        reasoning = `${intact} citizens confirmed repair is intact without dissent.`;
      } else if (damaged >= 2) {
        recommendation = "REJECT_FIX";
        confidence = 0.88;
        reasoning = `${damaged} independent citizen audits reported defect remains damaged.`;
      }

      return {
        recommendation,
        confidence,
        reasoning,
        voteBreakdown: { intact, damaged, cannotSee },
      };
    }

    case "G-CHAT": {
      const query = typeof inp.query === "string" ? inp.query : "";
      const issues = Array.isArray(inp.issues) ? (inp.issues as Array<Record<string, unknown>>) : [];
      const citedIds = issues
        .slice(0, 3)
        .map((iss) => (iss && typeof iss === "object" && "id" in iss ? String(iss.id) : ""))
        .filter(Boolean);

      const topIssue = issues[0];
      const answer = topIssue
        ? `Regarding "${query}": high priority attention is recommended for [#${topIssue.id}] (${topIssue.category} on ${topIssue.location || topIssue.road || 'corridor'}, priority ${topIssue.priority}). Additional active items requiring coordination include ${citedIds.slice(1).map((id: string) => `[#${id}]`).join(", ")}.`
        : `Analysis for '${query}': evaluated ${issues.length} active issues in the pilot area. High priority repairs needed on key arterial segments [${citedIds.map((id) => `#${id}`).join(", ")}].`;

      return {
        answer,
        citedIssueIds: citedIds,
        suggestedFollowups: [
          "Which contractors have pending warranty claims?",
          "Show recommended repair windows for high-priority potholes.",
        ],
      };
    }

    default:
      return {
        fallback: true,
        reason: "rules_fallback_default",
      };
  }
}
