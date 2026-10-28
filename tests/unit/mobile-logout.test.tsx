import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AppHeader } from "@/components/layout/AppHeader";

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/desk",
}));

describe("Mobile Logout Component Rendering", () => {
  it("renders LogoutButton with Log out label and test id", () => {
    const html = renderToStaticMarkup(<LogoutButton testId="test-logout-btn" />);
    expect(html).toContain('data-testid="test-logout-btn"');
    expect(html).toContain("Log out");
    expect(html).toContain("button");
  });

  it("renders compact LogoutButton with correct styles", () => {
    const html = renderToStaticMarkup(<LogoutButton variant="compact" testId="citizen-logout-button" />);
    expect(html).toContain('data-testid="citizen-logout-button"');
    expect(html).toContain("Log out");
  });

  it("renders a visible log out button in the desk header on desk routes", () => {
    const html = renderToStaticMarkup(
      <AppHeader
        title="Operations Queue"
        subtitle="Shared Desk Command"
        accentColor="var(--accent-cyan)"
      />
    );
    expect(html).toContain('data-testid="desk-logout-button"');
    expect(html).toContain("Log out");
  });
});
