import { describe, it, expect } from "vitest";
import {
  normalizeText,
  verbatimCheck,
  numbersGrounded,
  confidenceAtLeast,
} from "@/lib/ai/validators";

describe("T50 AI Validators", () => {
  describe("normalizeText", () => {
    it("lowercases and collapses whitespace sequences", () => {
      expect(normalizeText("   BBMP   Roads   \n\t Department   ")).toBe("bbmp roads department");
    });
  });

  describe("verbatimCheck", () => {
    const ocrSource = "BBMP MAJOR ROADS DEPARTMENT. Work order: WO/2026/9941. Contractor: Sri Lakshmi Constructions.";

    it("passes when all extracted non-null fields appear verbatim (case-insensitive, whitespace normalized)", () => {
      const fields = [
        "BBMP",
        "bbmp major roads",
        "WO/2026/9941",
        "Sri   Lakshmi   Constructions",
      ];
      expect(verbatimCheck(fields, ocrSource)).toBe(true);
    });

    it("passes when optional fields are null or undefined", () => {
      const fields = ["BBMP", null, undefined, ""];
      expect(verbatimCheck(fields, ocrSource)).toBe(true);
    });

    it("fails when an extracted field does not appear in the source text", () => {
      const fields = ["BBMP", "L&T Infrastructure"];
      expect(verbatimCheck(fields, ocrSource)).toBe(false);
    });

    it("fails when a single number or word in the field differs", () => {
      const fields = ["WO/2026/9942"]; // Note 9942 vs 9941
      expect(verbatimCheck(fields, ocrSource)).toBe(false);
    });
  });

  describe("numbersGrounded", () => {
    it("passes when all numbers in text appear in facts (string or number formats)", () => {
      const facts = [
        { id: "1", text: "3 potholes reported on 27th October" },
        { id: "2", text: "SLA window is 48 hours with 1.5 meter depth" },
      ];
      const validText = "3 potholes were found, with a 1.5 meter depth and 48 hours SLA.";
      expect(numbersGrounded(validText, facts)).toBe(true);
    });

    it("passes when generated text contains no numbers at all", () => {
      const facts = ["Potholes found on ORR"];
      const text = "Repairs have been scheduled for the damaged section.";
      expect(numbersGrounded(text, facts)).toBe(true);
    });

    it("fails when generated text introduces a hallucinated number not present in facts", () => {
      const facts = [
        { id: "1", text: "3 potholes observed near Kadubeesanahalli" },
      ];
      const hallucinatedText = "There are 5 potholes observed at the location.";
      expect(numbersGrounded(hallucinatedText, facts)).toBe(false);
    });

    it("fails when a date or SLA hour is altered by the LLM", () => {
      const facts = ["Repairs took 48 hours to complete"];
      const alteredText = "Repairs were finished in 24 hours.";
      expect(numbersGrounded(alteredText, facts)).toBe(false);
    });
  });

  describe("confidenceAtLeast", () => {
    const isAtLeast70 = confidenceAtLeast(0.7);

    it("passes when confidence is at or above threshold and <= 1.0", () => {
      expect(isAtLeast70(0.7)).toBe(true);
      expect(isAtLeast70(0.85)).toBe(true);
      expect(isAtLeast70(1.0)).toBe(true);
    });

    it("fails when confidence is below threshold", () => {
      expect(isAtLeast70(0.69)).toBe(false);
      expect(isAtLeast70(0.3)).toBe(false);
    });

    it("fails when confidence is invalid, negative, > 1.0, or not a number", () => {
      expect(isAtLeast70(1.2)).toBe(false);
      expect(isAtLeast70(-0.1)).toBe(false);
      expect(isAtLeast70(NaN)).toBe(false);
      expect(isAtLeast70(undefined)).toBe(false);
      expect(isAtLeast70("0.85")).toBe(false);
    });
  });
});
