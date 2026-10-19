"use client";

import { useEffect, useState } from "react";
import { Landmark, Pencil } from "lucide-react";
import Modal from "@/app/components/Modal";
import { ApiError } from "@/lib/api/client";
import type { PayoutAccount } from "@/lib/api/payments";
import { useBanks, useSetPayoutAccount } from "@/lib/api/hooks/usePayouts";
import { accountNumberError } from "@/lib/validations/payout";

const inputClass =
  "w-full bg-surface-muted border border-border-default rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-seller-main/30 focus:border-seller-main transition aria-invalid:border-red-400";

const when = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" });

interface Errors {
  bank?: string | null;
  account?: string | null;
  form?: string | null;
}

// Guide 5.4: the seller picks a bank and types the account number; Paystack checks the name on it.
// Only the bank, the last 4 digits and the name are kept.
function PayoutAccountSheet({ isOpen, onClose, onSaved }: { isOpen: boolean; onClose: () => void; onSaved: (account: PayoutAccount) => void }) {
  const banks = useBanks(isOpen);
  const save = useSetPayoutAccount();
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (!isOpen) return;
    setBankCode("");
    setAccountNumber("");
    setErrors({});
  }, [isOpen]);

  const notConfigured = banks.error instanceof ApiError && banks.error.code === "PAYMENTS_NOT_CONFIGURED";

  const submit = async () => {
    const found: Errors = {
      bank: bankCode ? null : "Choose the bank this account is with",
      account: accountNumberError(accountNumber),
    };
    setErrors(found);
    if (found.bank || found.account) return;
    try {
      const account = await save.mutateAsync({ bankCode, accountNumber: accountNumber.replace(/\s/g, "") });
      onSaved(account);
      onClose();
    } catch (err) {
      setErrors({
        form:
          err instanceof ApiError && err.code === "PAYMENT_PROVIDER_ERROR"
            ? "We couldn't confirm that account with your bank. Check the number and bank, then try again."
            : err instanceof ApiError
              ? err.message
              : "Couldn't save. Please try again.",
      });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={save.isPending ? () => undefined : onClose}
      title="Payout account"
      footer={
        <button
          type="button"
          onClick={submit}
          disabled={save.isPending || !banks.isSuccess}
          className="w-full py-4 rounded-full bg-seller-main text-white font-bold text-sm disabled:opacity-50"
        >
          {save.isPending ? "Checking with your bank…" : "Save account"}
        </button>
      }
    >
      <div className="flex flex-col gap-5">
        {banks.isPending ? (
          <div className="h-12 animate-pulse rounded-xl bg-surface-muted" aria-busy="true" aria-label="Loading banks" />
        ) : banks.isError ? (
          <div role="alert" className="flex flex-col gap-1 rounded-xl bg-surface-muted px-4 py-3 text-sm">
            <p className="font-semibold text-foreground">{notConfigured ? "Payouts aren't switched on yet" : "We couldn't load the list of banks"}</p>
            {notConfigured ? (
              <p className="text-xs text-foreground-muted">You can add your account once CampusMart turns on online payments.</p>
            ) : (
              <button type="button" onClick={() => banks.refetch()} className="self-start text-xs font-semibold text-seller-main">
                Try again
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="payout-bank" className="text-sm font-semibold text-foreground">
                Bank
              </label>
              <select
                id="payout-bank"
                value={bankCode}
                aria-invalid={!!errors.bank}
                onChange={(e) => setBankCode(e.target.value)}
                className={inputClass}
              >
                <option value="">Choose your bank</option>
                {banks.data.map((bank) => (
                  <option key={bank.code} value={bank.code}>
                    {bank.name}
                  </option>
                ))}
              </select>
              {errors.bank && <p role="alert" className="text-xs font-medium text-red-500">{errors.bank}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="payout-account-number" className="text-sm font-semibold text-foreground">
                Account number
              </label>
              <input
                id="payout-account-number"
                inputMode="numeric"
                autoComplete="off"
                maxLength={13}
                value={accountNumber}
                placeholder="0123456789"
                aria-invalid={!!errors.account}
                onChange={(e) => setAccountNumber(e.target.value)}
                className={inputClass}
              />
              {errors.account ? (
                <p role="alert" className="text-xs font-medium text-red-500">{errors.account}</p>
              ) : (
                <p className="text-xs text-foreground-muted">We check the name on the account with your bank. We never store the full number.</p>
              )}
            </div>
            <p className="rounded-xl bg-surface-muted px-4 py-3 text-xs text-foreground-muted">
              For your safety, payouts pause for 24 hours after you add or change this account, and we email you about it.
            </p>
          </>
        )}
        {errors.form && (
          <p role="alert" className="text-xs font-medium text-red-500">
            {errors.form}
          </p>
        )}
      </div>
    </Modal>
  );
}

// Where the seller's payouts go (guide 5.4, decision P9)
export default function PayoutAccountCard({
  account,
  onSaved,
}: {
  account: PayoutAccount;
  onSaved: (account: PayoutAccount) => void;
}) {
  const [editing, setEditing] = useState(false);
  const has = !!account.accountLast4;

  return (
    <section
      id="payout-account"
      aria-labelledby="payout-account-title"
      className={`flex flex-col gap-3 rounded-lg border p-5 ${has ? "border-border-default bg-card" : "border-blue-200 bg-blue-50"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="payout-account-title" className="text-base font-semibold text-foreground">
            Payout account
          </h2>
          {!has && <p className="mt-0.5 text-xs text-foreground-muted">Add the bank account your earnings should go to. Payouts wait until you do.</p>}
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex shrink-0 items-center gap-1 rounded-full border border-border-default bg-card px-3 py-1.5 text-xs font-semibold text-seller-main"
        >
          <Pencil size={12} />
          {has ? "Change" : "Add account"}
        </button>
      </div>
      {has && (
        <div className="flex items-start gap-2 text-sm">
          <Landmark size={16} className="mt-0.5 shrink-0 text-seller-main" />
          <div className="min-w-0">
            <p className="font-medium text-foreground">
              {account.bankName} ••{account.accountLast4}
            </p>
            {account.accountName && <p className="text-xs text-foreground-muted">{account.accountName}</p>}
          </div>
        </div>
      )}
      {account.holdUntil && (
        <p className="rounded-xl bg-orange-50 px-3 py-2 text-xs text-foreground">
          Payouts start again {when.format(new Date(account.holdUntil))}, 24 hours after this account was set.
        </p>
      )}
      <PayoutAccountSheet isOpen={editing} onClose={() => setEditing(false)} onSaved={onSaved} />
    </section>
  );
}
