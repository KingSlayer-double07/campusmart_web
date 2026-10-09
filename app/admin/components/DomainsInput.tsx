"use client";

import { Plus, X } from "lucide-react";
import { isValidDomain, normalizeDomain, splitDomains } from "@/lib/validations/institution";
import { cn } from "@/lib/utils/cn";
import { inputClass } from "./fields";

interface DomainsInputProps {
  id: string;
  domains: string[];
  onDomainsChange: (domains: string[]) => void;
  /** The text being typed. Lifted so the form can include it on save. */
  draft: string;
  onDraftChange: (draft: string) => void;
  onError: (message: string | null) => void;
  invalid?: boolean;
}

// Adds a draft to the list, or explains why it can't be added
export function addDraft(domains: string[], draft: string): { domains: string[]; error: string | null } {
  const candidates = splitDomains(draft);
  if (candidates.length === 0) return { domains, error: null };
  const bad = candidates.find((d) => !isValidDomain(d));
  if (bad) {
    return {
      domains,
      error: `"${bad}" doesn't look like an email domain. Use the part after @, such as unilag.edu.ng`,
    };
  }
  const next = [...domains];
  for (const domain of candidates) if (!next.includes(domain)) next.push(domain);
  return { domains: next, error: null };
}

// Email domains as removable chips. Enter, comma or the Add button adds what's typed.
export default function DomainsInput({
  id,
  domains,
  onDomainsChange,
  draft,
  onDraftChange,
  onError,
  invalid,
}: DomainsInputProps) {
  const commit = () => {
    const result = addDraft(domains, draft);
    onError(result.error);
    if (!result.error) {
      onDomainsChange(result.domains);
      onDraftChange("");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {domains.length > 0 && (
        <ul aria-label="Email domains" className="flex flex-wrap gap-2">
          {domains.map((domain) => (
            <li
              key={domain}
              className="flex items-center gap-1 rounded-full bg-main-subtle py-1 pl-3 pr-1 text-sm font-medium text-main"
            >
              {domain}
              <button
                type="button"
                aria-label={`Remove ${domain}`}
                onClick={() => onDomainsChange(domains.filter((d) => d !== domain))}
                className="flex size-6 items-center justify-center rounded-full hover:bg-main-pale"
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={draft}
          aria-invalid={invalid || undefined}
          placeholder={domains.length ? "Add another domain" : "unilag.edu.ng"}
          onChange={(e) => {
            onError(null);
            onDraftChange(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={() => draft.trim() && normalizeDomain(draft) && commit()}
          className={cn(inputClass, invalid && "border-red-400")}
        />
        <button
          type="button"
          onClick={commit}
          disabled={!draft.trim()}
          className="flex shrink-0 items-center gap-1 rounded-xl border border-border-default bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-surface-muted disabled:opacity-40"
        >
          <Plus size={16} />
          Add
        </button>
      </div>
    </div>
  );
}
