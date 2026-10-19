"use client";

import { useEffect, useState } from "react";
import Button from "@/app/components/Button";
import InfoBanner from "@/app/components/InfoBanner";
import Modal from "@/app/components/Modal";
import type { AdminCampusPlace, AdminInstitution } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";
import { useCreateCampusPlace, useUpdateCampusPlace } from "@/lib/api/hooks/useAdminCampusPlaces";
import { Field, Select, TextInput } from "../components/fields";

interface Errors {
  institutionId?: string | null;
  name?: string | null;
  form?: string | null;
}

// Add or rename a campus place. Its school is chosen once and can't change afterwards.
export default function PlaceForm({
  isOpen,
  onClose,
  place,
  institutions,
  defaultInstitutionId,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  place?: AdminCampusPlace | null;
  institutions: AdminInstitution[];
  defaultInstitutionId?: string;
  onSaved: (place: AdminCampusPlace, mode: "created" | "updated") => void;
}) {
  const create = useCreateCampusPlace();
  const update = useUpdateCampusPlace();
  const [institutionId, setInstitutionId] = useState("");
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (!isOpen) return;
    setInstitutionId(place?.institution.id ?? defaultInstitutionId ?? (institutions.length === 1 ? institutions[0].id : ""));
    setName(place?.name ?? "");
    setErrors({});
    // institutions only seed the default; a refetch mustn't wipe what's been typed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, place, defaultInstitutionId]);

  const saving = create.isPending || update.isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    const found: Errors = {
      institutionId: !place && !institutionId ? "Choose the school this place is at" : null,
      name: trimmed.length < 2 || trimmed.length > 80 ? "Name the place the way students say it (2 to 80 characters)" : null,
    };
    setErrors(found);
    if (found.institutionId || found.name) return;
    try {
      const saved = place
        ? await update.mutateAsync({ id: place.id, body: { name: trimmed } })
        : await create.mutateAsync({ institutionId, name: trimmed });
      onSaved(saved, place ? "updated" : "created");
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === "CONFLICT") setErrors({ name: err.message });
      else if (err instanceof ApiError && err.code === "INVALID_REFERENCE") setErrors({ institutionId: err.message });
      else setErrors({ form: err instanceof ApiError ? err.message : "Something went wrong. Please try again." });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => undefined : onClose}
      title={place ? "Rename campus place" : "Add campus place"}
      className="sm:max-w-lg"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" className="sm:w-auto" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="place-form" className="sm:w-auto" loading={saving}>
            {place ? "Save changes" : "Add place"}
          </Button>
        </div>
      }
    >
      <form id="place-form" onSubmit={submit} noValidate className="flex flex-col gap-5">
        {place ? (
          <div className="rounded-xl bg-surface-muted px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">Institution</p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">{place.institution.name}</p>
          </div>
        ) : (
          <Field label="Institution" htmlFor="place-institution" error={errors.institutionId}>
            <Select
              id="place-institution"
              value={institutionId}
              onChange={(e) => {
                setInstitutionId(e.target.value);
                setErrors((prev) => ({ ...prev, institutionId: null }));
              }}
              invalid={!!errors.institutionId}
            >
              <option value="">Choose a school</option>
              {institutions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                  {i.isActive ? "" : " (switched off)"}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field
          label="Place name"
          htmlFor="place-name"
          error={errors.name}
          hint="A hall, faculty or gate. Buyers pick it at checkout, and the rider calls them when they get there."
        >
          <TextInput
            id="place-name"
            value={name}
            maxLength={80}
            placeholder="Moremi Hall"
            invalid={!!errors.name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((prev) => ({ ...prev, name: null }));
            }}
          />
        </Field>

        {errors.form && <InfoBanner variant="error" text={errors.form} />}
      </form>
    </Modal>
  );
}
