"use client";

import { useEffect, useState } from "react";
import Button from "@/app/components/Button";
import InfoBanner from "@/app/components/InfoBanner";
import Modal from "@/app/components/Modal";
import type { AdminInstitution } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";
import { useCreateInstitution, useUpdateInstitution } from "@/lib/api/hooks/useAdminInstitutions";
import DomainsInput, { addDraft } from "../components/DomainsInput";
import { Field, TextInput } from "../components/fields";

interface Errors {
  name?: string | null;
  domains?: string | null;
  form?: string | null;
}

// Add or edit an institution: its name and the email domains its students sign up with
export default function InstitutionForm({
  isOpen,
  onClose,
  institution,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** Set to edit; leave out to add a new one */
  institution?: AdminInstitution | null;
  onSaved: (institution: AdminInstitution, mode: "created" | "updated") => void;
}) {
  const create = useCreateInstitution();
  const update = useUpdateInstitution();
  const [name, setName] = useState("");
  const [domains, setDomains] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (!isOpen) return;
    setName(institution?.name ?? "");
    setDomains(institution?.domains ?? []);
    setDraft("");
    setErrors({});
  }, [isOpen, institution]);

  const saving = create.isPending || update.isPending;
  const example = domains[0];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pending = addDraft(domains, draft);
    const nextErrors: Errors = {
      name: name.trim().length < 2 ? "Enter the institution's name" : null,
      domains:
        pending.error ?? (pending.domains.length === 0 ? "Add at least one email domain, such as unilag.edu.ng" : null),
    };
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.domains) return;
    setDomains(pending.domains);
    setDraft("");

    const body = { name: name.trim(), domains: pending.domains };
    try {
      const saved = institution
        ? await update.mutateAsync({ id: institution.id, body })
        : await create.mutateAsync(body);
      onSaved(saved, institution ? "updated" : "created");
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === "DOMAIN_IN_USE") setErrors({ domains: err.message });
      else if (err instanceof ApiError && err.code === "CONFLICT") setErrors({ name: err.message });
      else setErrors({ form: err instanceof ApiError ? err.message : "Something went wrong. Please try again." });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => undefined : onClose}
      title={institution ? "Edit institution" : "Add institution"}
      className="sm:max-w-lg"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" className="sm:w-auto" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="institution-form" className="sm:w-auto" loading={saving}>
            {institution ? "Save changes" : "Add institution"}
          </Button>
        </div>
      }
    >
      <form id="institution-form" onSubmit={submit} noValidate className="flex flex-col gap-5">
        <Field label="Name" htmlFor="institution-name" error={errors.name}>
          <TextInput
            id="institution-name"
            value={name}
            maxLength={120}
            invalid={!!errors.name}
            placeholder="University of Lagos"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field
          label="Student email domains"
          htmlFor="institution-domain"
          error={errors.domains}
          hint={
            example ? (
              <>
                Students with emails such as <strong>ada@{example}</strong> or{" "}
                <strong>ada@students.{example}</strong> can sign up.
              </>
            ) : (
              "The part after @ in your students' school emails. Sub-domains are included automatically."
            )
          }
        >
          <DomainsInput
            id="institution-domain"
            domains={domains}
            onDomainsChange={setDomains}
            draft={draft}
            onDraftChange={setDraft}
            onError={(message) => setErrors((prev) => ({ ...prev, domains: message }))}
            invalid={!!errors.domains}
          />
        </Field>

        {errors.form && <InfoBanner variant="error" text={errors.form} />}
      </form>
    </Modal>
  );
}
