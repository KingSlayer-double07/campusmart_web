import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DomainsInput, { addDraft } from "./DomainsInput";

function Harness() {
  const [domains, setDomains] = useState<string[]>(["unilag.edu.ng"]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <DomainsInput
        id="d"
        domains={domains}
        onDomainsChange={setDomains}
        draft={draft}
        onDraftChange={setDraft}
        onError={setError}
      />
      {error && <p>{error}</p>}
    </>
  );
}

describe("addDraft", () => {
  it("adds normalised domains once each", () => {
    expect(addDraft(["unilag.edu.ng"], " @Staff.UNILAG.edu.ng, unilag.edu.ng ")).toEqual({
      domains: ["unilag.edu.ng", "staff.unilag.edu.ng"],
      error: null,
    });
  });

  it("explains a bad domain without adding anything", () => {
    const result = addDraft([], "not a domain");
    expect(result.domains).toEqual([]);
    expect(result.error).toMatch(/"not a domain" doesn't look like an email domain/);
  });
});

describe("DomainsInput", () => {
  afterEach(cleanup);

  it("adds a chip on Enter and removes it with its button", () => {
    render(<Harness />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "students.unilag.edu.ng" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("students.unilag.edu.ng")).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Remove unilag.edu.ng" }));
    expect(screen.queryByText("unilag.edu.ng")).toBeNull();
  });

  it("keeps a bad entry in the box and says why", () => {
    render(<Harness />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "unilag" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText(/doesn't look like an email domain/)).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe("unilag");
  });
});
