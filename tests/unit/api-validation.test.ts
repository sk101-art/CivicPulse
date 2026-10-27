import { describe, it, expect, vi, beforeEach } from "vitest";
import { coordinateSchema, evidenceGpsSchema, PILOT_BOUNDS } from "@/lib/api/validate";
import { formatZodError, validationErrorResponse } from "@/lib/api/errors";
import { withAuth } from "@/lib/api/auth";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth/next";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

describe("T12 Acceptance: Validation Layer and API Error Contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("missing lat → 400 with fields.lat", () => {
    const input = { lng: 77.5946 };
    const result = coordinateSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      const formatted = formatZodError(result.error);
      expect(formatted.code).toBe("VALIDATION_ERROR");
      expect(formatted.fields.lat).toBeDefined();

      const response = validationErrorResponse(result.error);
      expect(response.status).toBe(400);
    }
  });

  it("lat 0 → 400 (outside pilot bounds)", () => {
    const input = { lat: 0, lng: 77.5946 };
    const result = coordinateSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      const formatted = formatZodError(result.error);
      expect(formatted.code).toBe("VALIDATION_ERROR");
      expect(formatted.fields.lat).toContain(String(PILOT_BOUNDS.minLat));

      const response = validationErrorResponse(result.error);
      expect(response.status).toBe(400);
    }
  });

  it("accuracy 80 m → 400 (exceeds max allowable GPS accuracy for evidence)", () => {
    const input = { lat: 12.9716, lng: 77.5946, gpsAccuracyM: 80 };
    const result = evidenceGpsSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      const formatted = formatZodError(result.error);
      expect(formatted.code).toBe("VALIDATION_ERROR");
      expect(formatted.fields.gpsAccuracyM).toContain(String(PILOT_BOUNDS.maxGpsAccuracyM));

      const response = validationErrorResponse(result.error);
      expect(response.status).toBe(400);
    }
  });

  it("valid coordinates and accuracy within pilot region succeed", () => {
    const input = { lat: 12.9716, lng: 77.5946, gpsAccuracyM: 15 };
    const result = evidenceGpsSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lat).toBe(12.9716);
      expect(result.data.lng).toBe(77.5946);
      expect(result.data.gpsAccuracyM).toBe(15);
    }
  });

  it("citizen calling a desk route → 403 FORBIDDEN", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: {
        id: "citizen_user_1",
        email: "citizen@example.com",
        role: Role.CITIZEN,
      },
      expires: "2099-01-01",
    });

    const auth = await withAuth(Role.AUTHORITY);

    expect(auth.user).toBeNull();
    expect(auth.error).not.toBeNull();
    expect(auth.error!.status).toBe(403);

    const json = await auth.error!.json();
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("unauthenticated request to protected route → 401 UNAUTHORIZED", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const auth = await withAuth();

    expect(auth.user).toBeNull();
    expect(auth.error).not.toBeNull();
    expect(auth.error!.status).toBe(401);

    const json = await auth.error!.json();
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("authorized user with matching role succeeds with typed user", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: {
        id: "desk_officer_1",
        email: "desk-a@civicpulse.local",
        role: Role.AUTHORITY,
      },
      expires: "2099-01-01",
    });

    const auth = await withAuth(Role.AUTHORITY);

    expect(auth.error).toBeNull();
    expect(auth.user).not.toBeNull();
    expect(auth.user!.email).toBe("desk-a@civicpulse.local");
    expect(auth.user!.role).toBe(Role.AUTHORITY);
  });
});
