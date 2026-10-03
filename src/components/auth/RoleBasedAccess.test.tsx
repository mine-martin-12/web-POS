import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { capabilitiesFor } from "@/lib/permissions";
import type { Security } from "@/hooks/useSecurity";
import { RoleBasedAccess } from "./RoleBasedAccess";

let security: Security;
vi.mock("@/hooks/useSecurity", () => ({ useSecurity: () => security }));

const as = (role: "admin" | "user" | null, isLoadingRole = false): Security => ({
  ...capabilitiesFor(role),
  isAdmin: role === "admin",
  isUser: role === "user",
  isLoadingRole,
});

const renderGate = (props: Partial<React.ComponentProps<typeof RoleBasedAccess>> = {}) =>
  render(
    <MemoryRouter>
      <RoleBasedAccess adminOnly {...props}>
        <p>secret admin panel</p>
      </RoleBasedAccess>
    </MemoryRouter>,
  );

describe("RoleBasedAccess", () => {
  beforeEach(() => {
    security = as(null);
  });

  it("never shows admin UI while the role is loading", () => {
    security = as("admin", true);
    renderGate();
    expect(screen.queryByText("secret admin panel")).not.toBeInTheDocument();
    expect(screen.queryByText("Admin privileges required")).not.toBeInTheDocument();
  });

  it("shows children to admins", () => {
    security = as("admin");
    renderGate();
    expect(screen.getByText("secret admin panel")).toBeInTheDocument();
  });

  it("shows the admin-required message to staff", () => {
    security = as("user");
    renderGate();
    expect(screen.queryByText("secret admin panel")).not.toBeInTheDocument();
    expect(screen.getByText("Admin privileges required")).toBeInTheDocument();
  });

  it("can gate on a capability and render nothing as fallback", () => {
    security = as("user");
    const { container } = renderGate({ adminOnly: false, capability: "canDeleteRecords", fallback: null });
    expect(container).toBeEmptyDOMElement();
  });
});
