import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { shouldRenderSetupScreen } from "../bootstrap";
import { SetupRequired, SETUP_REQUIRED_HEADING } from "../SetupRequired";

const CONFIGURED = {
  VITE_SUPABASE_URL: "https://example-project.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_placeholder",
};

describe("startup gate", () => {
  it("mounts the app when required configuration is present", () => {
    expect(shouldRenderSetupScreen(CONFIGURED)).toBe(false);
  });

  it("shows the setup screen when configuration is absent or malformed", () => {
    expect(shouldRenderSetupScreen({})).toBe(true);
    expect(shouldRenderSetupScreen({ VITE_SUPABASE_URL: CONFIGURED.VITE_SUPABASE_URL })).toBe(true);
    expect(shouldRenderSetupScreen({ ...CONFIGURED, VITE_SUPABASE_URL: "nope" })).toBe(true);
  });
});

describe("SetupRequired screen", () => {
  it("explains how a remixer configures their own backend", () => {
    render(<SetupRequired />);

    expect(screen.getByRole("heading", { name: SETUP_REQUIRED_HEADING })).toBeInTheDocument();
    expect(screen.getByText(/\.env\.example/)).toBeInTheDocument();
    expect(screen.getByText("docs/OPEN_SOURCE_RELEASE_BASELINE.md")).toBeInTheDocument();
    expect(screen.getByText("VITE_SUPABASE_URL")).toBeInTheDocument();
    expect(screen.getByText("VITE_SUPABASE_PUBLISHABLE_KEY")).toBeInTheDocument();
  });

  it("exposes no configuration values or project references", () => {
    const { container } = render(<SetupRequired />);
    const text = container.textContent ?? "";

    expect(text).not.toMatch(/supabase\.co/);
    expect(text).not.toMatch(/sb_publishable_/);
    expect(text).not.toMatch(/eyJ/); // JWT-shaped values
    expect(text).not.toMatch(/cosmi/i);
  });
});
