"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

const BENEFITS = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
    title: "Early Access",
    desc: "Be the first to list products and services when we launch.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ),
    title: "Zero Commission",
    desc: "Sell fee-free during our exclusive launch window.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    title: "Priority Support",
    desc: "Direct line to our team to set up your store perfectly.",
  },
];

type Status = "idle" | "loading" | "success" | "error";

export default function WaitlistPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [school, setSchool] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setStatus("loading");
    setErrorMsg("");

    try {
      // Simulate API call — replace with real endpoint
      await new Promise((res) => setTimeout(res, 1600));
      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMsg("Something went wrong. Please try again.");
    }
  }

  return (
    <>
      {/* Decorative blobs */}
      <div
        aria-hidden
        className="pointer-events-none fixed -top-24 -right-24 w-72 h-72 rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, #ff681f 0%, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -bottom-32 -left-20 w-80 h-80 rounded-full opacity-15"
        style={{ background: "radial-gradient(circle, #ff681f 0%, transparent 70%)" }}
      />

      <main className="flex flex-col pb-16 px-5 pt-10">

        {/* ── Logo / Brand ── */}
        <header className="flex items-center justify-between mb-10">
          <Link href="/" className="flex items-center gap-2">
            {/* <div
              className="size-9 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-md"
              style={{ background: "#ff681f" }}
            >
              C
            </div> */}
            <Image src="/favicon.ico" alt="Logo" width={28} height={28} />
            <span className="font-bold text-[17px] tracking-tight">CampusMart</span>
          </Link>
          <span className="text-[12px] font-semibold px-3 py-1.5 rounded-full text-white"
            style={{ background: "#ff681f" }}>
            Seller Waitlist
          </span>
        </header>

        {/* ── Hero copy ── */}
        {status !== "success" && (
          <>
            <section className="mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-100 mb-4">
                <span className="size-2 rounded-full bg-[#ff681f] animate-pulse" />
                <span className="text-[12px] font-semibold text-[#ff681f]">Coming soon to your campus</span>
              </div>

              <h1 className="text-[32px] font-bold leading-[1.15] text-[#1c1c1c] mb-3">
                Sell to your campus.<br />
                <span style={{ color: "#ff681f" }}>Start before anyone else.</span>
              </h1>

              <p className="text-[15px] text-foreground-muted leading-relaxed font-medium">
                CampusMart is the marketplace built for students, by students.
                Join the seller waitlist and get exclusive early access when we launch.
              </p>
            </section>

            {/* ── Benefits ── */}
            <section className="flex flex-col gap-3 mb-8">
              {BENEFITS.map((b) => (
                <div
                  key={b.title}
                  className="flex items-start gap-3.5 p-4 bg-card rounded-2xl border border-border-default shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]"
                >
                  <div
                    className="shrink-0 size-9 rounded-xl flex items-center justify-center text-white mt-0.5"
                    style={{ background: "#ff681f" }}
                  >
                    {b.icon}
                  </div>
                  <div>
                    <p className="text-[14px] font-bold text-[#1c1c1c]">{b.title}</p>
                    <p className="text-[13px] text-foreground-muted font-medium mt-0.5">{b.desc}</p>
                  </div>
                </div>
              ))}
            </section>

            {/* ── Form ── */}
            <section className="bg-card rounded-3xl border border-border-default shadow-[0_4px_24px_-6px_rgba(0,0,0,0.08)] p-5">
              <h2 className="text-[18px] font-bold text-[#1c1c1c] mb-1">Reserve your spot</h2>
              <p className="text-[13px] text-foreground-muted font-medium mb-5">
                We&apos;ll notify you the moment doors open.
              </p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {/* Name */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="waitlist-name" className="text-[12.5px] font-semibold text-foreground-muted uppercase tracking-wide">
                    Full Name
                  </label>
                  <input
                    id="waitlist-name"
                    type="text"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-4 py-3.5 rounded-xl border border-border-default bg-[#fafafa] text-[14.5px] font-medium text-[#1c1c1c] placeholder:text-foreground-muted outline-none transition-all focus:border-[#ff681f] focus:ring-2 focus:ring-[#ff681f]/15"
                  />
                </div>

                {/* Email */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="waitlist-email" className="text-[12.5px] font-semibold text-foreground-muted uppercase tracking-wide">
                    Email Address
                  </label>
                  <input
                    id="waitlist-email"
                    type="email"
                    placeholder="you@university.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3.5 rounded-xl border border-border-default bg-[#fafafa] text-[14.5px] font-medium text-[#1c1c1c] placeholder:text-foreground-muted outline-none transition-all focus:border-[#ff681f] focus:ring-2 focus:ring-[#ff681f]/15"
                  />
                </div>

                {/* School */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="waitlist-school" className="text-[12.5px] font-semibold text-foreground-muted uppercase tracking-wide">
                    School / University
                  </label>
                  <input
                    id="waitlist-school"
                    type="text"
                    placeholder="e.g. University of Lagos"
                    value={school}
                    onChange={(e) => setSchool(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-xl border border-border-default bg-[#fafafa] text-[14.5px] font-medium text-[#1c1c1c] placeholder:text-foreground-muted outline-none transition-all focus:border-[#ff681f] focus:ring-2 focus:ring-[#ff681f]/15"
                  />
                </div>

                {/* Category */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="waitlist-category" className="text-[12.5px] font-semibold text-foreground-muted uppercase tracking-wide">
                    What will you sell?
                  </label>
                  <select
                    id="waitlist-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-xl border border-border-default bg-[#fafafa] text-[14.5px] font-medium text-[#1c1c1c] outline-none transition-all focus:border-[#ff681f] focus:ring-2 focus:ring-[#ff681f]/15 appearance-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23a3a3a3' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center" }}
                  >
                    <option value="" disabled>Select a category</option>
                    <option value="food">Food & Snacks</option>
                    <option value="fashion">Fashion & Clothing</option>
                    <option value="electronics">Electronics & Gadgets</option>
                    <option value="books">Textbooks & Stationery</option>
                    <option value="services">Services (tutoring, printing…)</option>
                    <option value="beauty">Beauty & Skincare</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {/* Error */}
                {status === "error" && (
                  <p className="text-[13px] text-red-500 font-medium">{errorMsg}</p>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="w-full py-4 rounded-2xl text-white font-bold text-[15px] transition-all active:scale-[0.98] disabled:opacity-70 mt-1"
                  style={{ background: status === "loading" ? "#ff8c52" : "#ff681f" }}
                >
                  {status === "loading" ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      Securing your spot…
                    </span>
                  ) : (
                    "Join the Seller Waitlist →"
                  )}
                </button>

                <p className="text-center text-[12px] text-foreground-muted font-medium">
                  No spam, ever. We pinky-promise. 🤙
                </p>
              </form>
            </section>
          </>
        )}

        {/* ── Success state ── */}
        {status === "success" && (
          <section className="flex flex-col items-center justify-center text-center flex-1 py-16 gap-6">
            <div
              className="size-20 rounded-full flex items-center justify-center mb-2 shadow-lg"
              style={{ background: "#ff681f" }}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <h2 className="text-[28px] font-bold text-[#1c1c1c] mb-2">You&apos;re on the list! 🎉</h2>
              <p className="text-[15px] text-foreground-muted font-medium leading-relaxed">
                We&apos;ve saved your spot, <strong className="text-[#1c1c1c]">{name.split(" ")[0]}</strong>.<br />
                We&apos;ll email <strong className="text-[#1c1c1c]">{email}</strong> when we&apos;re ready to go live.
              </p>
            </div>
            <div className="w-full p-4 bg-orange-50 border border-orange-100 rounded-2xl text-[13.5px] text-[#ff681f] font-semibold">
              Tell a friend — every seller you refer moves you up the queue
            </div>
            <Link
              href="/"
              className="text-[14px] text-foreground-muted font-medium hover:text-foreground-muted transition-colors"
            >
              ← Back to home
            </Link>
          </section>
        )}

        {/* ── Footer ── */}
        <footer className="mt-10 flex flex-col items-center gap-1">
          <p className="text-[12px] text-foreground-muted font-medium">
            © {new Date().getFullYear()} CampusMart. All rights reserved.
          </p>
          <p className="text-[12px] text-foreground-muted font-medium">
            Already a seller?{" "}
            <Link href="/onboarding/sellers/sign-in" className="text-[#ff681f] font-semibold hover:underline">
              Sign in here
            </Link>
          </p>
        </footer>
      </main>
    </>
  );
}
