"use client";

import { useEffect, useState } from "react";
import Button from "@/app/components/Button";
import InfoBanner from "@/app/components/InfoBanner";
import Modal from "@/app/components/Modal";
import { ApiError } from "@/lib/api/client";
import type { AdminDeliveryJob } from "@/lib/api/dispatch";
import { useAdminRiders, useAssignRider } from "@/lib/api/hooks/useAdminDispatch";
import { Field, Select, TextInput } from "../components/fields";

// Decision C5: after the 5-hour alert, or when a rider gives a job back, an admin assigns one
export default function AssignRiderDialog({
  job,
  onClose,
  onAssigned,
}: {
  job: AdminDeliveryJob | null;
  onClose: () => void;
  onAssigned: (job: AdminDeliveryJob) => void;
}) {
  const assign = useAssignRider();
  const riders = useAdminRiders({ status: "ACTIVE", ...(job && { institutionId: job.institutionId }) }, !!job);
  const [riderId, setRiderId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRiderId("");
    setReason("");
    setError(null);
  }, [job]);

  const choices = (riders.data?.pages.flatMap((p) => p.items) ?? []).filter((r) => !r.invitePending && r.id !== job?.rider?.id);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;
    if (!riderId) return setError("Choose a rider");
    try {
      onAssigned(await assign.mutateAsync({ jobId: job.id, riderId, ...(reason.trim() && { reason: reason.trim() }) }));
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't assign the rider. Please try again.");
    }
  };

  return (
    <Modal
      isOpen={!!job}
      onClose={assign.isPending ? () => undefined : onClose}
      title={job?.rider ? "Reassign this job" : "Assign a rider"}
      className="sm:max-w-lg"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" className="sm:w-auto" onClick={onClose} disabled={assign.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="assign-form" className="sm:w-auto" loading={assign.isPending}>
            Assign
          </Button>
        </div>
      }
    >
      <form id="assign-form" onSubmit={submit} noValidate className="flex flex-col gap-5">
        {job?.rider && (
          <p className="text-sm text-foreground-muted">
            Now with {job.rider.name}. Any parcel they already carry stays with them until you sort it out.
          </p>
        )}
        <Field label="Rider" htmlFor="assign-rider" error={error} hint={job ? `Active riders at ${job.institutionName}` : undefined}>
          <Select id="assign-rider" value={riderId} invalid={!!error} onChange={(e) => setRiderId(e.target.value)}>
            <option value="">{riders.isPending ? "Loading riders…" : "Choose a rider"}</option>
            {choices.map((r) => (
              <option key={r.id} value={r.id}>
                {[r.firstName, r.lastName].filter(Boolean).join(" ") || r.email} ({r.activeJobs} {r.activeJobs === 1 ? "job" : "jobs"} now)
              </option>
            ))}
          </Select>
        </Field>
        {riders.isSuccess && choices.length === 0 && <InfoBanner text="No active rider at this campus has accepted an invite yet." />}
        <Field label="Note (optional)" htmlFor="assign-reason" hint="Kept in the audit log">
          <TextInput id="assign-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Nobody took it in 5 hours" />
        </Field>
      </form>
    </Modal>
  );
}
