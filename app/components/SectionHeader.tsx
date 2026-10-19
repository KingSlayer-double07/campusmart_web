"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";

type Props = {
  title: string;
  href?: string;
  linkText?: string;
};

export default function SectionHeader({
  title,
  href,
  linkText = "See all",
}: Props) {
  return (
    <div className="w-full flex justify-between px-4">
      <p className="text-sm font-semibold">{title}</p>
      {href ? (
        <Link href={href} className="text-main text-xs flex items-center">
          <p>{linkText}</p>
          <ChevronRight size={15} />
        </Link>
      ) : null}
    </div>
  );
}
