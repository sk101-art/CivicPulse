export function getRulesFallback(feature: string, input: unknown): Record<string, unknown> {
  const inp = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;

  switch (feature) {
    case "G1": {
      // Photo triage fallback when no AI provider was available
      return {
        category: "unknown",
        shows_reported_defect: "unclear",
        scene: "other",
        size_class: "unknown",
        lane_position: "unknown",
        water_present: "unknown",
        recapture_suspected: "unknown",
        faces_or_plates: "no",
        confidence: 0,
        is_fallback: true,
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
      const number = (key: string) => typeof inp[key] === "number" && Number.isFinite(inp[key]) ? inp[key] as number : null;
      const priority = number("priority");
      const deterioration = number("deteriorationScore");
      const delay = number("liveCongestionPct");
      const buses = number("busesPerHour");
      const category = typeof inp.category === "string" ? inp.category : "Recorded issue";
      const summary = [
        category,
        priority === null ? "Priority unavailable." : `Recorded priority ${priority}.`,
        deterioration === null ? "Deterioration estimate unavailable." : `Model deterioration estimate ${deterioration}/100.`,
        delay === null ? "Current traffic unavailable." : `Provider traffic delay ${delay}%.`,
        buses === null ? "Bus frequency unavailable." : `Recorded bus frequency ${buses} buses/h.`,
      ].join(" ");
      return {
        summary,
        priorityAdjustmentRecommended: 0,
        reasoning: "Automated assessment unavailable; retain recorded priority pending staff review.",
        keyRisks: ["Risk assessment requires staff review; missing readings are not evidence of low risk."],
        suggestedAction: "Review recorded evidence and assign the responsible team.",
      };
    }

    case "G-BRIEF": {
      const wardName = typeof inp.wardName === "string" ? inp.wardName : "Selected area";
      const wardCode = typeof inp.wardCode === "string" ? inp.wardCode : "ALL";
      const openCount = typeof inp.totalActiveIssues === "number" ? inp.totalActiveIssues : typeof inp.totalOpen === "number" ? inp.totalOpen : typeof inp.openIssuesCount === "number" ? inp.openIssuesCount : null;
      const countText = openCount === null ? "Active issue count unavailable" : `${openCount} open issues`;
      return {
        wardCode,
        wardName,
        headline: `${wardName}: ${countText}`,
        brief: `${wardName} (${wardCode}): ${countText}. Automated interpretation is unavailable; review the recorded issue queue. No weather or road-condition measurement is inferred from missing data.`,
        recommendedActions: ["Review recorded evidence and assign the responsible team."],
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
      const metrics = (inp.metrics && typeof inp.metrics === "object") ? (inp.metrics as Record<string, unknown>) : {};

      // 1. Out of domain refusal (e.g. weather, temperature, forecast)
      if (
        qLower.includes("weather") ||
        qLower.includes("temperature") ||
        qLower.includes("forecast") ||
        qLower.includes("predict tomorrow") ||
        qLower.includes("will it rain") ||
        qLower.includes("rainfall expected")
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
      const topIssue = issues[0];
      const topId = typeof topIssue?.id === "string" ? topIssue.id : "";
      const topCategory = typeof topIssue?.category === "string" ? topIssue.category : "Unknown category";
      const topAddress = typeof topIssue?.address === "string"
        ? topIssue.address
        : typeof topIssue?.location === "string" ? topIssue.location : "Location unavailable";

      // 2. Unresolved critical issues / ward query
      if (qLower.includes("unresolved") || qLower.includes("critical") || (qLower.includes("which ward") && qLower.includes("most"))) {
        const unresolvedWards = Array.isArray(metrics.unresolvedCriticalByWard)
          ? metrics.unresolvedCriticalByWard as Array<Record<string, unknown>>
          : [];
        const topWard = unresolvedWards[0];
        if (!topWard) {
          return {
            answer: "Ward-level critical issue counts are not available in the current context.",
            citedIssueIds: [],
            suggestedFollowups: ["Refresh the desk data or choose a ward and time period."],
          };
        }
        const wardName = typeof topWard.ward === "string" ? topWard.ward : "Selected wards";
        const wardIssue = issues.find((i) => typeof i.ward === "string" && i.ward.toLowerCase().includes(wardName.toLowerCase())) || topIssue;
        const citedId = typeof wardIssue?.id === "string" ? wardIssue.id : "";
        const citedTitle = typeof wardIssue?.title === "string"
          ? wardIssue.title
          : `${typeof wardIssue?.category === "string" ? wardIssue.category : topCategory} on ${typeof wardIssue?.address === "string" ? wardIssue.address : topAddress}`;
        const criticalCount = typeof topWard.criticalCount === "number" ? topWard.criticalCount : null;
        const priority = typeof wardIssue?.priority === "number" ? `, priority ${wardIssue.priority}` : "";

        return {
          answer: `${wardName} currently has the most unresolved critical issues${criticalCount === null ? "" : ` with ${criticalCount} open critical defects`}.${citedId ? ` Immediate attention is required for [#${citedId}] (${citedTitle}${priority}).` : ""}`,
          citedIssueIds: citedId ? [citedId] : [],
          suggestedFollowups: [
            "Which contractor has the highest defect liability rate?",
            "Show recommended repair windows for high-priority potholes.",
          ],
        };
      }

      // 3. Repair lifespan query (city-wide or ward)
      if (qLower.includes("lifespan") || qLower.includes("average repair") || qLower.includes("repair lifespan")) {
        const lifespan = metrics.repairLifespan && typeof metrics.repairLifespan === "object"
          ? metrics.repairLifespan as Record<string, unknown>
          : {};
        const perWard = Array.isArray(lifespan.perWard) ? lifespan.perWard as Array<Record<string, unknown>> : [];
        const cityWide = typeof lifespan.cityWideMedianDays === "number" ? lifespan.cityWideMedianDays : null;
        const matchedWard = perWard.find((w) => typeof w.ward === "string" && qLower.includes(w.ward.toLowerCase())) || perWard[0];
        const wardName = typeof matchedWard?.ward === "string" ? matchedWard.ward : null;
        const wardLifespan = typeof matchedWard?.medianLifespanDays === "number" ? matchedWard.medianLifespanDays : cityWide;
        if (wardLifespan === null) {
          return {
            answer: "Repair lifespan measurements are not available in the current context.",
            citedIssueIds: [],
            suggestedFollowups: ["Choose a ward and time period with completed repairs."],
          };
        }

        const wardIssue = wardName
          ? issues.find((i) => typeof i.ward === "string" && i.ward.toLowerCase().includes(wardName.toLowerCase()))
          : topIssue;
        const citedId = typeof wardIssue?.id === "string" ? wardIssue.id : "";
        const citedTitle = typeof wardIssue?.title === "string" ? wardIssue.title : `${typeof wardIssue?.category === "string" ? wardIssue.category : topCategory} on ${typeof wardIssue?.address === "string" ? wardIssue.address : topAddress}`;
        const cityText = cityWide === null ? "" : ` (city-wide median is ${cityWide} days)`;

        return {
          answer: `For ${wardName ? `${wardName} ward` : "the selected area"}, the median repair lifespan is ${wardLifespan} days${cityText}.${citedId ? ` Ongoing defects monitored include [#${citedId}] (${citedTitle}).` : ""}`,
          citedIssueIds: citedId ? [citedId] : [],
          suggestedFollowups: [
            "Which contractor has the highest defect liability rate?",
            "What is the claim gap for this ward?",
          ],
        };
      }

      // 4. Contractor / defect liability query
      if (qLower.includes("contractor") || qLower.includes("defect liability") || qLower.includes("liability rate")) {
        const contractors = Array.isArray(metrics.contractors) ? metrics.contractors as Array<Record<string, unknown>> : [];
        const topContractor = contractors[0];
        if (!topContractor) {
          return {
            answer: "Contractor defect-liability metrics are not available in the current context.",
            citedIssueIds: [],
            suggestedFollowups: ["Refresh the desk data or choose a time period with completed repairs."],
          };
        }

        const contractorName = typeof topContractor.contractor === "string" ? topContractor.contractor : "Selected contractor";
        const contractorIssue = issues.find((i) => typeof i.contractor === "string" && i.contractor.toLowerCase().includes(contractorName.toLowerCase())) || topIssue;
        const citedId = typeof contractorIssue?.id === "string" ? contractorIssue.id : "";
        const citedTitle = typeof contractorIssue?.title === "string" ? contractorIssue.title : `${typeof contractorIssue?.category === "string" ? contractorIssue.category : topCategory} on ${typeof contractorIssue?.address === "string" ? contractorIssue.address : topAddress}`;

        return {
          answer: `${contractorName} has the highest defect liability rate${typeof topContractor.defectLiabilityRatePercent === "number" ? ` at ${topContractor.defectLiabilityRatePercent}%` : ""}${typeof topContractor.reopenedInWarranty === "number" && typeof topContractor.totalIssues === "number" ? ` (${topContractor.reopenedInWarranty} repairs reopened in warranty out of ${topContractor.totalIssues} total assignments)` : ""}.${citedId ? ` Defect currently flagged under warranty audit is [#${citedId}] (${citedTitle}).` : ""}`,
          citedIssueIds: citedId ? [citedId] : [],
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
        const citedTitle = typeof primaryIssue.title === "string" ? primaryIssue.title : `${typeof primaryIssue.category === "string" ? primaryIssue.category : topCategory} on ${typeof primaryIssue.address === "string" ? primaryIssue.address : topAddress}`;
        const issueId = typeof primaryIssue.id === "string" ? primaryIssue.id : "";
        const priority = typeof primaryIssue.priority === "number" ? `, priority ${primaryIssue.priority}` : "";
        const risk = typeof primaryIssue.risk === "string" ? `, risk: ${primaryIssue.risk}` : "";
        const bestWindow = typeof primaryIssue.bestWindow === "string" ? `, best repair window: ${primaryIssue.bestWindow}` : "";
        return {
          answer: `Active defects reported include${issueId ? ` [#${issueId}]` : ""} (${citedTitle}${priority}${risk}${bestWindow}). ${selectedIssues.length > 1 ? `Other open items include ${selectedIssues.slice(1).map((i) => `[#${String(i.id)}] (${String(i.category ?? "Unknown category")} on ${String(i.address ?? "Location unavailable")})`).join(", ")}.` : ""}`,
          citedIssueIds: citedIds,
          suggestedFollowups: [
            "Show traffic congestion during scheduled repair window",
            "Check contractor defect warranty for this segment",
          ],
        };
      }

      return {
        answer: issues.length === 0
          ? "No issue records are available in the current context. Select a ward or time period with data, then try again."
          : `Civic infrastructure operations summary: evaluated ${issues.length} active issues.${topId ? ` The first listed issue is [#${topId}] (${topCategory} on ${topAddress}).` : ""}`,
        citedIssueIds: topId ? [topId] : [],
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
