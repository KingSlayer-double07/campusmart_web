import { Cookie, Handbag, HeartHandshake, LaptopMinimal, ScanFace, WandSparkles, type LucideIcon } from "lucide-react";
import { CATEGORY_LABELS, type ListingCategory } from "@/lib/labels";

export interface CategoryItemData {
  value: ListingCategory;
  name: string;
  Icon: LucideIcon;
}

// The category strip on the home and categories pages ("Others" is reachable through search)
export const CATEGORY_ITEMS: CategoryItemData[] = (
  [
    ["FASHION", Handbag],
    ["BEAUTY", ScanFace],
    ["FOOD", Cookie],
    ["CREATIVE", WandSparkles],
    ["TECH", LaptopMinimal],
    ["SERVICES", HeartHandshake],
  ] as const
).map(([value, Icon]) => ({ value, name: CATEGORY_LABELS[value], Icon }));
