"use client";

import { useEffect, useState } from "react";
import Button from "@/app/components/Button";
import InfoBanner from "@/app/components/InfoBanner";
import Modal from "@/app/components/Modal";
import type { AdminInstitution, AdminPickupStation } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";
import { useCreateStation, useUpdateStation } from "@/lib/api/hooks/useAdminStations";
import { hoursFromRows, openingHoursError, rowsFromHours, type DayRow } from "@/lib/openingHours";
import { Field, Select, TextArea, TextInput } from "../components/fields";
import OpeningHoursEditor from "./OpeningHoursEditor";

const PHONE_RE = /^\+?\d[\d ()-]{6,19}$/; // same rule as the API

type FieldName = "institutionId" | "name" | "address" | "contactName" | "contactPhone" | "openingHours" | "form";
type Errors = Partial<Record<FieldName, string | null>>;

interface Values {
  institutionId: string;
  name: string;
  address: string;
  contactName: string;
  contactPhone: string;
}

export function validateStation(values: Values, rows: DayRow[], creating: boolean): Errors {
  const errors: Errors = {};
  if (creating && !values.institutionId) errors.institutionId = "Choose the school this station serves";
  if (values.name.trim().length < 2) errors.name = "Give the station a name buyers will recognise";
  if (values.address.trim().length < 5) errors.address = "Enter where the station is, so sellers and buyers can find it";
  if (values.contactName.trim().length < 2) errors.contactName = "Enter who runs the station";
  if (!PHONE_RE.test(values.contactPhone.trim())) errors.contactPhone = "Enter a phone number such as +234 801 234 5678";
  const hoursError = openingHoursError(hoursFromRows(rows));
  if (hoursError) errors.openingHours = hoursError;
  return errors;
}

// Add or edit a pickup station. Its school is chosen once and can't change afterwards.
export default function StationForm({
  isOpen,
  onClose,
  station,
  institutions,
  defaultInstitutionId,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  station?: AdminPickupStation | null;
  institutions: AdminInstitution[];
  defaultInstitutionId?: string;
  onSaved: (station: AdminPickupStation, mode: "created" | "updated") => void;
}) {
  const create = useCreateStation();
  const update = useUpdateStation();
  const [values, setValues] = useState<Values>({
    institutionId: "",
    name: "",
    address: "",
    contactName: "",
    contactPhone: "",
  });
  const [rows, setRows] = useState<DayRow[]>(rowsFromHours(null));
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (!isOpen) return;
    setValues({
      institutionId: station?.institution.id ?? defaultInstitutionId ?? (institutions.length === 1 ? institutions[0].id : ""),
      name: station?.name ?? "",
      address: station?.address ?? "",
      contactName: station?.contactName ?? "",
      contactPhone: station?.contactPhone ?? "",
    });
    setRows(rowsFromHours(station?.openingHours ?? null));
    setErrors({});
    // institutions only seed the default; a refetch mustn't wipe what's been typed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, station, defaultInstitutionId]);

  const set = (field: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    setErrors((prev) => ({ ...prev, [field]: null }));
  };

  const saving = create.isPending || update.isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validateStation(values, rows, !station);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;

    const body = {
      name: values.name.trim(),
      address: values.address.trim(),
      contactName: values.contactName.trim(),
      contactPhone: values.contactPhone.trim(),
      openingHours: hoursFromRows(rows),
    };
    try {
      const saved = station
        ? await update.mutateAsync({ id: station.id, body })
        : await create.mutateAsync({ ...body, institutionId: values.institutionId });
      onSaved(saved, station ? "updated" : "created");
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
      title={station ? "Edit pickup station" : "Add pickup station"}
      className="sm:max-w-xl"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" className="sm:w-auto" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="station-form" className="sm:w-auto" loading={saving}>
            {station ? "Save changes" : "Add station"}
          </Button>
        </div>
      }
    >
      <form id="station-form" onSubmit={submit} noValidate className="flex flex-col gap-5">
        {station ? (
          <div className="rounded-xl bg-surface-muted px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">Institution</p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">{station.institution.name}</p>
            <p className="mt-0.5 text-xs text-foreground-muted">
              A station stays with its school. To serve another school, add a new station there.
            </p>
          </div>
        ) : (
          <Field label="Institution" htmlFor="station-institution" error={errors.institutionId}>
            <Select
              id="station-institution"
              value={values.institutionId}
              onChange={set("institutionId")}
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

        <Field label="Station name" htmlFor="station-name" error={errors.name}>
          <TextInput
            id="station-name"
            value={values.name}
            maxLength={120}
            placeholder="Main Gate Pickup Point"
            invalid={!!errors.name}
            onChange={set("name")}
          />
        </Field>

        <Field label="Address or directions" htmlFor="station-address" error={errors.address}>
          <TextArea
            id="station-address"
            rows={2}
            maxLength={300}
            value={values.address}
            placeholder="Main Gate, University Road, beside the bookshop"
            invalid={!!errors.address}
            onChange={set("address")}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Contact person" htmlFor="station-contact" error={errors.contactName}>
            <TextInput
              id="station-contact"
              value={values.contactName}
              maxLength={120}
              placeholder="Bola Ade"
              invalid={!!errors.contactName}
              onChange={set("contactName")}
            />
          </Field>
          <Field label="Contact phone" htmlFor="station-phone" error={errors.contactPhone}>
            <TextInput
              id="station-phone"
              type="tel"
              inputMode="tel"
              value={values.contactPhone}
              placeholder="+234 801 234 5678"
              invalid={!!errors.contactPhone}
              onChange={set("contactPhone")}
            />
          </Field>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-foreground">Opening hours</p>
          <p className="text-xs text-foreground-muted">Buyers see these when they choose where to collect.</p>
          <OpeningHoursEditor
            rows={rows}
            onChange={(next) => {
              setRows(next);
              setErrors((prev) => ({ ...prev, openingHours: null }));
            }}
          />
          {errors.openingHours && (
            <p role="alert" className="text-xs font-medium text-red-500">
              {errors.openingHours}
            </p>
          )}
        </div>

        {errors.form && <InfoBanner variant="error" text={errors.form} />}
      </form>
    </Modal>
  );
}
