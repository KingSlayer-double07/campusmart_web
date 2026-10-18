import type { LegalDocument } from "@/lib/constants/legal";

// Renders the Terms or the Privacy Policy (decision T5) for the sign-up overlays and Help
export default function LegalDocumentBody({ doc }: { doc: LegalDocument }) {
  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="bg-surface-muted rounded-2xl p-5">
        <h3 className="text-foreground-muted font-bold text-[12px] uppercase tracking-wider mb-4">
          Quick summary (read this first)
        </h3>
        <ul className="flex flex-col gap-3">
          {doc.summary.map((item) => (
            <li key={item} className="flex gap-3 text-[14px] text-foreground-muted leading-relaxed">
              <span className="text-main font-bold">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {doc.sections.map((section) => (
        <section key={section.heading} className="flex flex-col gap-3">
          <h3 className="text-foreground font-bold text-[16px]">{section.heading}</h3>
          {section.body.map((block, i) =>
            typeof block === "string" ? (
              <p key={i} className="text-foreground-muted text-[14px] leading-relaxed">
                {block}
              </p>
            ) : (
              <ul key={i} className="flex flex-col gap-2 pl-2">
                {block.list.map((item) => (
                  <li key={item} className="flex gap-3 text-[14px] text-foreground-muted leading-relaxed">
                    <span className="text-main font-bold">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ),
          )}
        </section>
      ))}
    </div>
  );
}
