"use client";

import { useLangStore, translations } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

export default function AboutPage() {
  const { lang } = useLangStore();
  const t = translations[lang];
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#F5F5F7] pb-20">
      {/* Hero */}
      <div className="bg-white">
        <div className="max-w-2xl mx-auto px-6 pt-12 pb-16 text-center">
          <button
            onClick={() => router.back()}
            className="text-xs text-[#86868B] font-light hover:text-[#1D1D1F] mb-8 inline-flex items-center gap-1"
          >
            <ChevronLeft size={14} strokeWidth={1.5} /> Back
          </button>
          <h1 className="text-4xl font-light text-[#1D1D1F] tracking-[-0.02em] mb-4">
            Elaris
          </h1>
          <p className="text-base text-[#86868B] font-light max-w-md mx-auto leading-relaxed">
            Intelligence made persistent.
          </p>
        </div>
      </div>

      {/* Mission */}
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <section>
          <h2 className="text-xs font-medium text-[#86868B] uppercase tracking-[0.15em] mb-4">Mission</h2>
          <p className="text-base font-light text-[#1D1D1F] leading-[1.7]">
            We believe the people who shaped how we think deserve to keep shaping us.
            Elaris distills the cognitive patterns of history&apos;s most influential minds
            into AI personas you can talk to, learn from, and be challenged by.
          </p>
        </section>

        <section>
          <h2 className="text-xs font-medium text-[#86868B] uppercase tracking-[0.15em] mb-4">What we are</h2>
          <p className="text-base font-light text-[#1D1D1F] leading-[1.7]">
            A tool. Not a content platform. We provide the technology — you decide what to do with it.
            Every conversation is between you and an AI persona. We do not create personas of private
            individuals, and we do not use your conversations to train models.
          </p>
        </section>

        <section>
          <h2 className="text-xs font-medium text-[#86868B] uppercase tracking-[0.15em] mb-4">What we are not</h2>
          <ul className="space-y-3 text-base font-light text-[#1D1D1F] leading-[1.7]">
            <li>— Not a replacement for professional medical, legal, or financial advice.</li>
            <li>— Not a place to impersonate real people without their consent.</li>
            <li>— Not a content moderation minefield. You create, you own it.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xs font-medium text-[#86868B] uppercase tracking-[0.15em] mb-4">Built for</h2>
          <p className="text-base font-light text-[#1D1D1F] leading-[1.7]">
            Curious minds. Engineers arguing with Dijkstra. Founders asking Jobs why.
            Writers workshopping with Didion. Anyone who&apos;s ever wanted to ask a question
            they couldn&apos;t find a person to answer.
          </p>
        </section>

        <section className="pt-8 border-t border-[rgba(0,0,0,0.06)]">
          <p className="text-xs font-light text-[#86868B] text-center">
            Elaris is a product of independent operators building in the open.
          </p>
        </section>
      </div>
    </div>
  );
}
