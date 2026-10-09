import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const create = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const update = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
vi.mock("@/lib/api/hooks/useAdminInstitutions", () => ({
  useCreateInstitution: () => create,
  useUpdateInstitution: () => update,
}));

import { ApiError } from "@/lib/api/client";
import InstitutionForm from "./InstitutionForm";

const saved = {
  id: "i1",
  name: "Lagos State University",
  domains: ["lasu.edu.ng"],
  isActive: true,
  createdAt: "2026-10-09T00:00:00.000Z",
  stationCount: 0,
  userCount: 0,
};

describe("InstitutionForm", () => {
  beforeEach(() => {
    create.mutateAsync.mockReset();
    update.mutateAsync.mockReset();
  });
  afterEach(cleanup);

  const renderForm = (institution?: typeof saved) => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<InstitutionForm isOpen institution={institution} onClose={onClose} onSaved={onSaved} />);
    return { onSaved, onClose };
  };

  it("needs a name and at least one domain", async () => {
    renderForm();
    fireEvent.click(await screen.findByRole("button", { name: "Add institution" }));
    expect(await screen.findByText("Enter the institution's name")).toBeTruthy();
    expect(screen.getByText(/Add at least one email domain/)).toBeTruthy();
    expect(create.mutateAsync).not.toHaveBeenCalled();
  });

  it("saves a domain that was typed but not yet added", async () => {
    create.mutateAsync.mockResolvedValue(saved);
    const { onSaved, onClose } = renderForm();
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: " Lagos State University " } });
    fireEvent.change(screen.getByLabelText("Student email domains"), { target: { value: "LASU.edu.ng" } });
    fireEvent.click(screen.getByRole("button", { name: "Add institution" }));
    await waitFor(() =>
      expect(create.mutateAsync).toHaveBeenCalledWith({ name: "Lagos State University", domains: ["lasu.edu.ng"] }),
    );
    expect(onSaved).toHaveBeenCalledWith(saved, "created");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows DOMAIN_IN_USE under the domains", async () => {
    create.mutateAsync.mockRejectedValue(
      new ApiError(409, "DOMAIN_IN_USE", "lasu.edu.ng already belongs to Lagos State University"),
    );
    renderForm();
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Another" } });
    fireEvent.change(screen.getByLabelText("Student email domains"), { target: { value: "lasu.edu.ng" } });
    fireEvent.click(screen.getByRole("button", { name: "Add institution" }));
    expect(await screen.findByText("lasu.edu.ng already belongs to Lagos State University")).toBeTruthy();
  });

  it("edits an existing institution", async () => {
    update.mutateAsync.mockResolvedValue({ ...saved, name: "LASU" });
    const { onSaved } = renderForm(saved);
    const name = (await screen.findByLabelText("Name")) as HTMLInputElement;
    expect(name.value).toBe("Lagos State University");
    fireEvent.change(name, { target: { value: "LASU" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(update.mutateAsync).toHaveBeenCalledWith({ id: "i1", body: { name: "LASU", domains: ["lasu.edu.ng"] } }),
    );
    expect(onSaved).toHaveBeenCalledWith({ ...saved, name: "LASU" }, "updated");
  });
});
