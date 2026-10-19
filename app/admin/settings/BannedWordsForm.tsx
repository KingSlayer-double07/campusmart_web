"use client";

import { useEffect, useState } from "react";
import Button from "@/app/components/Button";
import { ApiError } from "@/lib/api/client";
import { useSetBannedWords } from "@/lib/api/hooks/useAdminModeration";
import { Field, TextArea } from "../components/fields";

// The API's limits (backend/src/settings/dto/banned-words.dto.ts)
const MAX_WORDS = 300;
const MIN_LENGTH = 2;
const MAX_LENGTH = 40;

// One word or phrase per line, as the API stores them: lower case, single spaces, no repeats
export function parseWords(text: string): string[] {
  return [
    ...new Set(
      text
        .split("\n")
        .map((line) => line.trim().toLowerCase().replace(/\s+/g, " "))
        .filter(Boolean),
    ),
  ].sort();
}

export function wordsError(words: string[]): string | null {
  const bad = words.find((w) => w.length < MIN_LENGTH || w.length > MAX_LENGTH);
  if (bad) return `"${bad}" must be ${MIN_LENGTH} to ${MAX_LENGTH} characters`;
  if (words.length > MAX_WORDS) return `Keep the list to ${MAX_WORDS} words or phrases`;
  return null;
}

// Decisions M4a and M4c: a listing using one of these waits for an admin before going live.
// Whole words in any case, so "gun" doesn't catch "begun".
export default function BannedWordsForm({
  words,
  onSaved,
}: {
  words: string[];
  onSaved: (saved: string[], added: number, removed: number) => void;
}) {
  const save = useSetBannedWords();
  const [text, setText] = useState(words.join("\n"));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setText(words.join("\n")), [words]);

  const parsed = parseWords(text);
  const changed = parsed.join("\n") !== [...words].sort().join("\n");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = wordsError(parsed);
    setError(problem);
    if (problem) return;
    try {
      const { words: saved } = await save.mutateAsync(parsed);
      onSaved(
        saved,
        saved.filter((w) => !words.includes(w)).length,
        words.filter((w) => !saved.includes(w)).length,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-2xl border border-border-default bg-card p-5">
      <Field
        label="Words and phrases"
        htmlFor="banned-words"
        error={error}
        hint={`One per line, ${parsed.length} of ${MAX_WORDS}. Matched as whole words in any case, in the title and description.`}
      >
        <TextArea
          id="banned-words"
          rows={10}
          value={text}
          invalid={!!error}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          className="font-mono text-[13px]"
        />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" className="sm:w-auto" loading={save.isPending} disabled={!changed}>
          Save words
        </Button>
      </div>
    </form>
  );
}
