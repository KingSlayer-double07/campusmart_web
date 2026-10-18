"use client";

import { useEffect, useState } from "react";
import Button from "@/app/components/Button";
import InfoBanner from "@/app/components/InfoBanner";
import Modal from "@/app/components/Modal";
import { ApiError } from "@/lib/api/client";
import { useSetRole } from "@/lib/api/hooks/useAdminModeration";
import { ROLE_LABELS, type AdminUser, type AssignableRole } from "@/lib/api/moderation";
import { Field, Select } from "../components/fields";

const ROLES: { value: AssignableRole; hint: string }[] = [
  { value: "BUYER", hint: "Buys from stores at their school." },
  { value: "SELLER", hint: "Runs a store. Needs an account linked to a school." },
  { value: "ADMIN", hint: "Full access to this console. They sign in with an emailed code each time." },
];

// Decision M1: other admins sign up first, then an admin gives them the role here. The user is
// signed out so the new role starts cleanly; a seller who stops selling has their listings archived.
export default function RoleDialog({
  user,
  isOpen,
  onClose,
  onChanged,
}: {
  user: AdminUser | null;
  isOpen: boolean;
  onClose: () => void;
  onChanged: (user: AdminUser) => void;
}) {
  const setRole = useSetRole();
  const [role, setRoleValue] = useState<AssignableRole>("BUYER");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !user) return;
    setRoleValue(user.role === "SELLER" || user.role === "ADMIN" ? user.role : "BUYER");
    setError(null);
  }, [isOpen, user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (role === user.role) {
      onClose();
      return;
    }
    try {
      onChanged(await setRole.mutateAsync({ id: user.id, role }));
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  };

  const hint = ROLES.find((r) => r.value === role)?.hint;
  const stopsSelling = user?.role === "SELLER" && role !== "SELLER";

  return (
    <Modal
      isOpen={isOpen}
      onClose={setRole.isPending ? () => undefined : onClose}
      title="Change role"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" className="sm:w-auto" onClick={onClose} disabled={setRole.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="role-form" className="sm:w-auto" loading={setRole.isPending}>
            Save role
          </Button>
        </div>
      }
    >
      <form id="role-form" onSubmit={submit} noValidate className="flex flex-col gap-4 text-sm">
        <p className="text-foreground-muted">
          {user?.name ?? user?.email} is a {user ? ROLE_LABELS[user.role].toLowerCase() : ""} now. They&apos;ll be signed out
          and sign in again with the new role. The change is kept in the audit log.
        </p>
        <Field label="Role" htmlFor="user-role" hint={hint}>
          <Select id="user-role" value={role} onChange={(e) => setRoleValue(e.target.value as AssignableRole)}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {ROLE_LABELS[r.value]}
              </option>
            ))}
          </Select>
        </Field>
        {stopsSelling && (
          <InfoBanner variant="warning" title="Their store closes" text="Their live listings are archived. Orders already placed carry on." />
        )}
        {error && (
          <div role="alert">
            <InfoBanner variant="error" title="Couldn't change the role" text={error} />
          </div>
        )}
      </form>
    </Modal>
  );
}
