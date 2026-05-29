'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';

const DEMO_PERSONAS = [
  { name: 'Elon Musk', color: '#FF6B35', initial: 'E' },
  { name: 'Albert Einstein', color: '#6B5B95', initial: 'A' },
  { name: 'Steve Jobs', color: '#1D1D1F', initial: 'S' },
];

const DEMO_MESSAGES = [
  { persona: 'Elon Musk', msg: 'First principles. Question the constraints.', color: '#FF6B35' },
  { persona: 'You', msg: 'Should I start the company?', color: undefined, isUser: true },
  { persona: 'Albert Einstein', msg: 'Curiosity matters more than certainty.', color: '#6B5B95' },
  { persona: 'Steve Jobs', msg: "You're not building a company. You're building a belief system.", color: '#1D1D1F' },
];

export default function HomePageV2() {
  const router = useRouter();
  const { token } = useAuthStore();

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Subtle background grid */}
      <div
        className="fixed inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 50%, #ffffff 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      />

      {/* HERO */}
      <section className="relative max-w-4xl mx-auto px-6 pt-36 pb-28 text-center">
        <p className="text-xs font-light tracking-[0.3em] text-[#86868B] uppercase mb-10">E L A R I S</p>

        <h1 className="text-4xl sm:text-5xl font-extralight text-white tracking-tight leading-[1.15] mb-6">
          Human intelligence,<br />made persistent.
        </h1>

        <p className="text-base text-[#86868B] font-light leading-relaxed max-w-xl mx-auto mb-12">
          Create AI personas from the minds, memories,<br />
          and thinking patterns of real people.
        </p>

        <button
          onClick={() => token ? router.push('/personas/new') : router.push('/register')}
          className="inline-flex items-center gap-2.5 px-8 py-4 rounded-full bg-white text-[#0a0a0f] text-sm font-light hover:bg-[#f0f0f0] transition-colors"
        >
          Start for free
          <span>→</span>
        </button>
      </section>

      {/* CONVERSATION DEMO */}
      <section className="relative max-w-5xl mx-auto px-6 pb-28">
        <div className="flex items-center justify-center mb-10">
          <span className="text-[10px] font-light text-[#86868B] tracking-[0.25em] uppercase">Multi-persona collaboration</span>
        </div>

        <div className="flex flex-col md:flex-row rounded-2xl overflow-hidden border border-[rgba(255,255,255,0.08)] shadow-sm" style={{ maxHeight: '420px' }}>
          {/* Left sidebar - dark */}
          <div className="w-full md:w-56 bg-[rgba(255,255,255,0.04)] border-r border-[rgba(255,255,255,0.06)] p-5 shrink-0">
            <div className="mb-6">
              <span className="text-xs font-light tracking-[0.2em] text-white opacity-60">E L A R I S</span>
            </div>
            <div className="flex items-center justify-center py-2.5 px-4 rounded-full border border-[rgba(255,255,255,0.12)] mb-6 cursor-pointer hover:border-[rgba(255,255,255,0.2)] transition-colors">
              <span className="text-[11px] text-white font-light">+ New</span>
            </div>
            <div className="text-[10px] font-light text-[rgba(255,255,255,0.25)] tracking-widest uppercase mb-4">Personas</div>
            {DEMO_PERSONAS.map((p) => (
              <div key={p.name} className="flex items-center gap-3 py-2.5">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-light text-white shrink-0"
                  style={{ backgroundColor: p.color }}
                >
                  {p.initial}
                </div>
                <span className="text-[11px] text-white font-light">{p.name}</span>
              </div>
            ))}
          </div>

          {/* Right chat - slightly lighter dark */}
          <div className="flex-1 bg-[rgba(255,255,255,0.02)] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
              <div>
                <div className="text-sm font-medium text-white">Startup Decision</div>
                <div className="text-[11px] text-[#86868B] font-light">3 participants</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[rgba(255,255,255,0.06)] flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="6" cy="5" r="2" stroke="#86868B" strokeWidth="1"/>
                    <path d="M1 12c0-2.2 2-3.7 5-3.7s5 1.5 5 3.7" stroke="#86868B" strokeWidth="1" strokeLinecap="round"/>
                    <path d="M11 3v4M9 5h4" stroke="#86868B" strokeWidth="1" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="w-8 h-8 rounded-full bg-[rgba(255,255,255,0.06)] flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M9 1L12 4L9 7" stroke="#86868B" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M1 5h10" stroke="#86868B" strokeWidth="1" strokeLinecap="round"/>
                    <path d="M3 8v4a1 1 0 01-1 1H1" stroke="#86868B" strokeWidth="1" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
              {DEMO_MESSAGES.map((m, i) => (
                <div key={i}>
                  {m.isUser ? (
                    <div className="flex justify-center">
                      <div className="bg-[rgba(255,255,255,0.08)] text-white px-4 py-2.5 rounded-2xl rounded-br-md text-sm font-light leading-relaxed max-w-[80%]">
                        {m.msg}
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <div
                        className="w-7 h-7 rounded-full shrink-0 mt-0.5 flex items-center justify-center text-[10px] font-light text-white"
                        style={{ backgroundColor: m.color }}
                      >
                        {m.persona[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-light text-[#86868B] mb-1">{m.persona}</div>
                        <div className="text-sm font-light leading-relaxed text-white">{m.msg}</div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="px-5 py-4 border-t border-[rgba(255,255,255,0.06)]">
              <div className="flex items-center gap-3 bg-[rgba(255,255,255,0.06)] rounded-2xl px-4 py-3">
                <div className="w-5 h-5 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3v10M3 8h10" stroke="#86868B" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                </div>
                <span className="text-[12px] text-[#86868B] font-light flex-1">Message or @persona</span>
                <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M7 5l3 3-3 3M1 8h9" stroke="#0a0a0f" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section className="max-w-5xl mx-auto px-6 pb-32 text-center">
        <button
          onClick={() => token ? router.push('/personas/new') : router.push('/register')}
          className="inline-flex items-center gap-2.5 px-8 py-4 rounded-full bg-white text-[#0a0a0f] text-sm font-light hover:bg-[#f0f0f0] transition-colors"
        >
          Create your first persona
          <span>→</span>
        </button>
      </section>
    </div>
  );
}