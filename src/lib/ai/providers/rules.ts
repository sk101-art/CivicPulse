export function getRulesFallback(feature: string, input: unknown): Record<string, unknown> {
  const inp = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;

  switch (feature) {
    case "G1": {
      // Photo triage
      const reportedCategory = typeof inp.category === "string" ? inp.category : "unknown";
      return {
        category: reportedCategory,
        shows_reported_defect: "yes",
        scene: "road",
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
        reasoning: adjustment !== 0
          ? `Adjustment ${adjustment > 0 ? `+${adjustment}` : adjustment} points recommended: ${keyRisks.join(" and ")}.`
          : "Defect priority matches observed conditions; no adjustment required.",
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
      const qLower = query.toLowerCase();
      const issues = Array.isArray(inp.issues) ? (inp.issues as Array<Record<string, unknown>>) : [];
      const metrics = (inp.metrics && typeof inp.metrics === "object") ? (inp.metrics as Record<string, any>) : {};

      // 1. Out of domain refusal (e.g. weather, temperature, forecast)
      if (
        qLower.includes("weather") ||
        qLower.includes("rain") ||
        qLower.includes("temperature") ||
        qLower.includes("forecast") ||
        qLower.includes("predict tomorrow")
      ) {
        return {
          answer: "I cannot predict weather conditions. As a civic infrastructure desk analyst, I only have access to road defect, contractor audit, and repair data.",
          citedIssueIds: [],
          suggestedFollowups: [
            "Which ward has the most unresolved critical issues right now?",
            "What is the average repair lifespan for Bellandur ward in the last 90 days?",
          ],
        };
      }

      // Pick top issue for citation
      const topIssue = issues[0] as Record<string, any> | undefined;
      const topId = topIssue?.id ? String(topIssue.id) : "seed-pilot-pothole-bellandur";
      const topCategory = topIssue?.category ? String(topIssue.category) : "POTHOLES";
      const topAddress = topIssue?.address || topIssue?.location || "Outer Ring Road";

      // 2. Unresolved critical issues / ward query
      if (qLower.includes("unresolved") || qLower.includes("critical") || (qLower.includes("which ward") && qLower.includes("most"))) {
        const unresolvedWards = Array.isArray(metrics.unresolvedCriticalByWard) ? metrics.unresolvedCriticalByWard : [];
        const topWard = unresolvedWards[0] || { ward: "Bellandur", criticalCount: 1 };
        const wardIssue = issues.find((i) => String(i.ward || "").toLowerCase().includes(String(topWard.ward).toLowerCase())) || topIssue;
        const citedId = wardIssue?.id ? String(wardIssue.id) : topId;
        const citedTitle = wardIssue?.title || `${wardIssue?.category || topCategory} on ${wardIssue?.address || topAddress}`;

        return {
          answer: `${topWard.ward} currently has the most unresolved critical issues with ${topWard.criticalCount} open critical defects. Immediate attention is required for [#${citedId}] (${citedTitle}, priority ${wardIssue?.priority ?? 85}).`,
          citedIssueIds: [citedId],
          suggestedFollowups: [
            "Which contractor has the highest defect liability rate?",
            "Show recommended repair windows for high-priority potholes.",
          ],
        };
      }

      // 3. Repair lifespan query (city-wide or ward)
      if (qLower.includes("lifespan") || qLower.includes("average repair") || qLower.includes("repair lifespan")) {
        const perWard = Array.isArray(metrics.repairLifespan?.perWard) ? metrics.repairLifespan.perWard : [];
        const cityWide = metrics.repairLifespan?.cityWideMedianDays ?? 45;
        const matchedWard = perWard.find((w: any) => qLower.includes(String(w.ward || "").toLowerCase())) || perWard[0];
        const wardName = matchedWard?.ward || "Bellandur";
        const wardLifespan = matchedWard?.medianLifespanDays ?? cityWide;

        const wardIssue = issues.find((i) => String(i.ward || "").toLowerCase().includes(wardName.toLowerCase())) || topIssue;
        const citedId = wardIssue?.id ? String(wardIssue.id) : topId;
        const citedTitle = wardIssue?.title || `${wardIssue?.category || topCategory} on ${wardIssue?.address || topAddress}`;

        return {
          answer: `For ${wardName} ward, the median repair lifespan is ${wardLifespan} days (city-wide median is ${cityWide} days). Ongoing defects monitored in this area include [#${citedId}] (${citedTitle}, priority ${wardIssue?.priority ?? 75}).`,
          citedIssueIds: [citedId],
          suggestedFollowups: [
            "Which contractor has the highest defect liability rate?",
            "What is the claim gap for this ward?",
          ],
        };
      }

      // 4. Contractor / defect liability query
      if (qLower.includes("contractor") || qLower.includes("defect liability") || qLower.includes("liability rate")) {
        const contractors = Array.isArray(metrics.contractors) ? metrics.contractors : [];
        const topContractor = contractors[0] || {
          contractor: "Cauvery Infrastructure Ltd.",
          defectLiabilityRatePercent: 25,
          reopenedInWarranty: 2,
          totalIssues: 8,
        };

        const contractorIssue = issues.find((i) => String(i.contractor || "").toLowerCase().includes(String(topContractor.contractor).toLowerCase())) || topIssue;
        const citedId = contractorIssue?.id ? String(contractorIssue.id) : topId;
        const citedTitle = contractorIssue?.title || `${contractorIssue?.category || topCategory} on ${contractorIssue?.address || topAddress}`;

        return {
          answer: `${topContractor.contractor} has the highest defect liability rate at ${topContractor.defectLiabilityRatePercent}% (${topContractor.reopenedInWarranty} repairs reopened in warranty out of ${topContractor.totalIssues} total assignments). Defect currently flagged under warranty audit is [#${citedId}] (${citedTitle}).`,
          citedIssueIds: [citedId],
          suggestedFollowups: [
            "Generate Defect Liability Package for this contractor",
            "Show claim gap for Desk A and Desk B",
          ],
        };
      }

      // 5. Active defects on a specific corridor/road/title
      const matchingIssues = issues.filter((iss) => {
        const addr = String(iss.address || iss.location || "").toLowerCase();
        const cat = String(iss.category || "").toLowerCase();
        return (addr && qLower.includes(addr.split(",")[0].toLowerCase())) || (cat && qLower.includes(cat));
      });
      const selectedIssues = matchingIssues.length > 0 ? matchingIssues.slice(0, 3) : issues.slice(0, 3);
      const citedIds = selectedIssues.map((iss) => String(iss.id)).filter(Boolean);
      const primaryIssue = selectedIssues[0] || topIssue;

      if (primaryIssue) {
        const citedTitle = primaryIssue.title || `${primaryIssue.category || topCategory} on ${primaryIssue.address || topAddress}`;
        return {
          answer: `Active defects reported include [#${primaryIssue.id}] (${citedTitle}, priority ${primaryIssue.priority ?? 80}, risk: ${primaryIssue.risk ?? 'HIGH'}, best repair window: ${primaryIssue.bestWindow ?? '01:00 - 05:00'}). ${selectedIssues.length > 1 ? `Other open items include ${selectedIssues.slice(1).map((i) => `[#${i.id}] (${i.category} on ${i.address})`).join(", ")}.` : ""}`,
          citedIssueIds: citedIds.length > 0 ? citedIds : [topId],
          suggestedFollowups: [
            "Show traffic congestion during scheduled repair window",
            "Check contractor defect warranty for this segment",
          ],
        };
      }

      return {
        answer: `Civic infrastructure operations summary: evaluated ${issues.length} active issues. Immediate priority assigned to [#${topId}] (${topCategory} on ${topAddress}).`,
        citedIssueIds: [topId],
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
