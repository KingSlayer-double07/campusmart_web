"use client";

import { useEffect, useState } from "react";
import Button from "@/app/components/Button";
import InfoBanner from "@/app/components/InfoBanner";
import Modal from "@/app/components/Modal";
import type { AdminInstitution } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";
import type { AdminRider } from "@/lib/api/dispatch";
import { useInviteRider } from "@/lib/api/hooks/useAdminDispatch";
import { phoneError } from "@/lib/validations/delivery";
import { Field, Select, TextInput } from "../components/fields";

interface Errors {
  email?: string | null;
  firstName?: string | null;
  institutionId?: string | null;
  phone?: string | null;
  form?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Decision DX1: an admin invites a rider by email and picks their campus. The rider sets their
// password from the emailed link (printed to the API console until MAIL_* is set up).
export default function InviteRiderDialog({
  isOpen,
  onClose,
  institutions,
  onInvited,
}: {
  isOpen: boolean;
  onClose: () => void;
  institutions: AdminInstitution[];
  onInvited: (rider: AdminRider) => void;
}) {
  const invite = useInviteRider();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [institutionId, setInstitutionId] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (!isOpen) return;
    setEmail("");
    setFirstName("");
    setLastName("");
    setPhone("");
    setInstitutionId(institutions.length === 1 ? institutions[0].id : "");
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found: Errors = {
      email: EMAIL_RE.test(email.trim()) ? null : "Enter the rider's email address",
      firstName: firstName.trim() ? null : "Enter their first name",
      institutionId: institutionId ? null : "Choose the campus they deliver at",
      phone: phone.trim() ? phoneError(phone) : null,
    };
    setErrors(found);
    if (found.email || found.firstName || found.institutionId || found.phone) return;
    try {
      const rider = await invite.mutateAsync({
        email: email.trim(),
        firstName: firstName.trim(),
        institutionId,
        ...(lastName.trim() && { lastName: lastName.trim() }),
        ...(phone.trim() && { phone: phone.trim() }),
      });
      onInvited(rider);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_TAKEN") setErrors({ email: err.message });
      else setErrors({ form: err instanceof ApiError ? err.message : "Something went wrong. Please try again." });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={invite.isPending ? () => undefined : onClose}
      title="Invite a rider"
      className="sm:max-w-lg"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" className="sm:w-auto" onClick={onClose} disabled={invite.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="invite-rider-form" className="sm:w-auto" loading={invite.isPending}>
            Send invite
          </Button>
        </div>
      }
    >
      <form id="invite-rider-form" onSubmit={submit} noValidate className="flex flex-col gap-5">
        <Field label="Email" htmlFor="rider-email" error={errors.email} hint="Any email the rider reads. Riders can't buy or sell with this account.">
          <TextInput id="rider-email" type="email" value={email} invalid={!!errors.email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="rider-first" error={errors.firstName}>
            <TextInput id="rider-first" value={firstName} maxLength={50} invalid={!!errors.firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field label="Last name (optional)" htmlFor="rider-last">
            <TextInput id="rider-last" value={lastName} maxLength={50} onChange={(e) => setLastName(e.target.value)} />
          </Field>
        </div>
        <Field label="Campus" htmlFor="rider-campus" error={errors.institutionId}>
          <Select id="rider-campus" value={institutionId} invalid={!!errors.institutionId} onChange={(e) => setInstitutionId(e.target.value)}>
            <option value="">Choose a campus</option>
            {institutions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Phone (optional)" htmlFor="rider-phone" error={errors.phone} hint="Only admins see it">
          <TextInput id="rider-phone" type="tel" value={phone} invalid={!!errors.phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        {errors.form && <InfoBanner variant="error" text={errors.form} />}
      </form>
    </Modal>
  );
}
