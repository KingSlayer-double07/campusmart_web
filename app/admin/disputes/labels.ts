// How dispute and problem reasons read on the admin screens (F6, C8, DL8)
export const REASON_LABELS: Record<string, string> = {
  NOT_AS_DESCRIBED: "Not as described",
  DAMAGED: "Damaged",
  WRONG_ITEM: "Wrong item",
  MISSING_ITEMS: "Items missing",
  LATE: "Late",
  LOST: "Lost",
  BUYER_NO_SHOW: "Buyer didn't show",
  OTHER: "Something else",
};

export const reasonLabel = (reason: string) => REASON_LABELS[reason] ?? reason;
