import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { SidebarProvider } from "@/context/SidebarContext";

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/citizen/dashboard",
}));

describe("Civic Atlas Global Collapsible Navigation Sidebar Component", () => {
  const dummyLinks = [
    { href: "/citizen/dashboard", icon: "Home", label: "Home" },
    { href: "/citizen/report", icon: "FileText", label: "Report an Issue" },
    { href: "/citizen/map", icon: "Map", label: "Map View" },
  ];

  it("renders the sidebar with Panel Control toggle button attached to right border", () => {
    const html = renderToStaticMarkup(
      <SidebarProvider>
        <AppSidebar
          role="CITIZEN"
          links={dummyLinks}
          userName="Sujay"
          userSubtitle="Citizen • Level 2"
        />
      </SidebarProvider>
    );

    expect(html).toContain('data-testid="app-sidebar"');
    expect(html).toContain('data-testid="sidebar-toggle-btn"');
    expect(html).toContain('aria-label="Collapse navigation sidebar"');
    expect(html).toContain('aria-expanded="true"');
    // Verify Lucide PanelLeftClose icon is rendered
    expect(html).toContain('lucide-panel-left-close');
  });

  it("renders role indicators, branding and navigation links in expanded mode", () => {
    const html = renderToStaticMarkup(
      <SidebarProvider>
        <AppSidebar
          role="CITIZEN"
          links={dummyLinks}
          userName="Sujay"
          userSubtitle="Citizen • Level 2"
        />
      </SidebarProvider>
    );

    expect(html).toContain("CivicPulse");
    expect(html).toContain("CIVIC ATLAS");
    expect(html).toContain("Report an Issue");
    expect(html).toContain("Map View");
  });

  it("renders initials avatar without hardcoded stock photo", () => {
    const html = renderToStaticMarkup(
      <SidebarProvider>
        <AppSidebar
          role="CITIZEN"
          links={dummyLinks}
          userName="Sujay"
          userSubtitle="Citizen • Level 2"
        />
      </SidebarProvider>
    );

    expect(html).not.toContain("avatar-ananya.jpg");
    expect(html).toContain("S"); // Initial for Sujay
  });

  it("renders municipal staff layout and links when role is AUTHORITY", () => {
    const deskLinks = [
      { href: "/desk/dashboard", icon: "LayoutDashboard", label: "Operations Queue" },
      { href: "/desk/map", icon: "Map", label: "Route Optimizer" },
    ];

    const html = renderToStaticMarkup(
      <SidebarProvider>
        <AppSidebar
          role="AUTHORITY"
          links={deskLinks}
          userName="Desk Officer"
          userSubtitle="Desk A (BBMP)"
        />
      </SidebarProvider>
    );

    expect(html).toContain("Municipal Staff");
    expect(html).toContain("Operations Queue");
    expect(html).toContain("Route Optimizer");
  });
});
