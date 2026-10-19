import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const moderationApi = vi.hoisted(() => ({ setBannedWords: vi.fn() }));
vi.mock("@/lib/api/moderation", async (actual) => ({ ...(await actual<object>()), moderationApi }));

import BannedWordsForm, { parseWords, wordsError } from "./BannedWordsForm";

function renderForm(onSaved = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BannedWordsForm words={["gun", "stolen"]} onSaved={onSaved} />
    </QueryClientProvider>,
  );
  return onSaved;
}

describe("BannedWordsForm (M4c)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("cleans the list the way the API stores it", () => {
    expect(parseWords(" Gun \n\nFAKE   id\ngun\nammo")).toEqual(["ammo", "fake id", "gun"]);
    expect(wordsError(["x"])).toMatch(/2 to 40 characters/);
    expect(wordsError(Array.from({ length: 301 }, (_, i) => `word${i}`))).toMatch(/300/);
    expect(wordsError(["gun"])).toBeNull();
  });

  it("saves the edited list and says what changed", async () => {
    moderationApi.setBannedWords.mockResolvedValue({ words: ["airsoft", "gun"] });
    const onSaved = renderForm();
    const save = screen.getByRole("button", { name: "Save words" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Words and phrases"), { target: { value: "gun\nAirsoft" } });
    expect(screen.getByText(/One per line, 2 of 300/)).toBeTruthy();
    fireEvent.click(save);
    await waitFor(() => expect(moderationApi.setBannedWords).toHaveBeenCalledWith(["airsoft", "gun"]));
    expect(onSaved).toHaveBeenCalledWith(["airsoft", "gun"], 1, 1);
  });

  it("explains a word that's too short instead of saving", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Words and phrases"), { target: { value: "gun\nx" } });
    fireEvent.click(screen.getByRole("button", { name: "Save words" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/"x" must be 2 to 40 characters/);
    expect(moderationApi.setBannedWords).not.toHaveBeenCalled();
  });
});
