'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';

const STEPS = [
  {
    num: '01',
    title: 'Ingest',
    desc: 'Upload memories, writings, conversations, and more',
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="mx-auto">
        <rect x="6" y="8" width="12" height="16" rx="2" stroke="#1D1D1F" strokeWidth="1.2" fill="none" opacity="0.5"/>
        <rect x="22" y="6" width="12" height="16" rx="2" stroke="#1D1D1F" strokeWidth="1.2" fill="none" opacity="0.7"/>
        <rect x="14" y="16" width="12" height="16" rx="2" stroke="#1D1D1F" strokeWidth="1.2" fill="none"/>
        <path d="M20 22 L20 28" stroke="#0071E3" strokeWidth="1.2" strokeLinecap="round"/>
        <path d="M17 25 L20 28 L23 25" stroke="#0071E3" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    num: '02',
    title: 'Distill',
    desc: 'ELARIS distills patterns, thoughts, and communication style',
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="mx-auto">
        <circle cx="20" cy="20" r="3" fill="#0071E3" opacity="0.8"/>
        <circle cx="12" cy="12" r="1.5" fill="#1D1D1F" opacity="0.4"/>
        <circle cx="28" cy="12" r="1.5" fill="#1D1D1F" opacity="0.4"/>
        <circle cx="12" cy="28" r="1.5" fill="#1D1D1F" opacity="0.4"/>
        <circle cx="28" cy="28" r="1.5" fill="#1D1D1F" opacity="0.4"/>
        <line x1="12" y1="12" x2="20" y2="20" stroke="#0071E3" strokeWidth="0.8" opacity="0.4"/>
        <line x1="28" y1="12" x2="20" y2="20" stroke="#0071E3" strokeWidth="0.8" opacity="0.4"/>
        <line x1="12" y1="28" x2="20" y2="20" stroke="#0071E3" strokeWidth="0.8" opacity="0.4"/>
        <line x1="28" y1="28" x2="20" y2="20" stroke="#0071E3" strokeWidth="0.8" opacity="0.4"/>
      </svg>
    ),
  },
  {
    num: '03',
    title: 'Form',
    desc: 'A unique digital persona comes to life',
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="mx-auto">
        <ellipse cx="20" cy="16" rx="7" ry="9" stroke="#1D1D1F" strokeWidth="1" fill="none" opacity="0.5"/>
        <circle cx="20" cy="16" r="2" fill="#0071E3" opacity="0.6"/>
        <line x1="16" y1="26" x2="20" y2="24" stroke="#1D1D1F" strokeWidth="1" opacity="0.4"/>
        <line x1="24" y1="26" x2="20" y2="24" stroke="#1D1D1F" strokeWidth="1" opacity="0.4"/>
      </svg>
    ),
  },
  {
    num: '04',
    title: 'Awaken',
    desc: 'Ready to converse, collaborate, and grow with you',
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="mx-auto">
        <rect x="6" y="8" width="28" height="24" rx="6" stroke="#1D1D1F" strokeWidth="1.2" fill="none"/>
        <circle cx="16" cy="18" r="4" fill="#1D1D1F" opacity="0.15"/>
        <circle cx="16" cy="18" r="2" fill="#1D1D1F" opacity="0.4"/>
        <rect x="22" y="14" width="8" height="2" rx="1" fill="#1D1D1F" opacity="0.2"/>
        <rect x="22" y="18" width="6" height="2" rx="1" fill="#1D1D1F" opacity="0.15"/>
        <rect x="22" y="22" width="7" height="2" rx="1" fill="#1D1D1F" opacity="0.15"/>
        <circle cx="30" cy="28" r="3" fill="#34C759" opacity="0.8"/>
        <circle cx="30" cy="28" r="1.5" fill="white" opacity="0.6"/>
      </svg>
    ),
  },
];

const DEMO_PERSONAS = [
  { name: 'Elon Musk', color: '#FF6B35', initial: 'E' },
  { name: 'Albert Einstein', color: '#6B5B95', initial: 'A' },
  { name: 'Steve Jobs', color: '#1D1D1F', initial: 'S' },
];

const DEMO_MESSAGES = [
  { persona: 'Elon Musk', msg: 'First principles. Question the constraints.', color: '#FF6B35', isUser: false },
  { persona: 'You', msg: 'Should I start the company?', color: '#FAFAFA', isUser: true },
  { persona: 'Albert Einstein', msg: 'Curiosity matters more than certainty.', color: '#6B5B95', isUser: false },
  { persona: 'Steve Jobs', msg: "You're not building a company. You're building a belief system.", color: '#1D1D1F', isUser: false },
];

export default function HomePageV2() {
  const router = useRouter();
  const { token } = useAuthStore();

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* HERO */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-20 text-center">
        <p className="text-xs font-light tracking-[0.2em] text-[#86868B] uppercase mb-4">E L A R I S</p>
        <h1 className="text-3xl sm:text-4xl font-light text-[#1D1D1F] tracking-tight leading-snug mb-4">
          Human intelligence,<br />made persistent.
        </h1>
        <p className="text-sm text-[#86868B] font-light leading-relaxed max-w-lg mx-auto">
          Create living AI personas from the minds, memories,<br className="hidden sm:block" />
          and thinking patterns of real people.
        </p>
      </section>

      {/* PERSONA CREATION */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <h2 className="text-xs font-light text-[#86868B] tracking-[0.15em] uppercase mb-10 text-center">
          From human to digital — a persona is born
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
          {STEPS.map((step) => (
            <div key={step.num} className="flex flex-col items-center text-center">
              <div className="mb-4">{step.icon}</div>
              <div className="text-[11px] font-light text-[#86868B] mb-1">{step.num}</div>
              <div className="text-sm font-light text-[#1D1D1F] mb-2 tracking-tight">{step.title}</div>
              <div className="text-[11px] text-[#86868B] font-light leading-relaxed px-2">{step.desc}</div>
            </div>
          ))}
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap justify-center gap-8 sm:gap-16 py-5 border-y border-[rgba(0,0,0,0.06)]">
          {[
            { label: 'Documents Processed', val: '1,248' },
            { label: 'Hours of Audio', val: '36.7' },
            { label: 'Conversations Analyzed', val: '2,731' },
            { label: 'Persona Fidelity', val: '98.6%' },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-base font-light text-[#1D1D1F]">{s.val}</div>
              <div className="text-[10px] text-[#86868B] font-light mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CONVERSATION DEMO */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <h2 className="text-xs font-light text-[#86868B] tracking-[0.15em] uppercase mb-8 text-center">
          Multi-persona collaboration
        </h2>

        <div className="flex flex-col md:flex-row rounded-xl overflow-hidden border border-[rgba(0,0,0,0.08)]" style={{ maxHeight: '360px' }}>
          {/* Left sidebar */}
          <div className="w-full md:w-52 bg-[#1D1D1F] p-4 shrink-0">
            <div className="flex items-center gap-2 mb-5">
              <span className="text-xs font-light tracking-[0.18em] text-white">E L A R I S</span>
            </div>
            <div className="flex items-center justify-center py-2 px-3 rounded-lg border border-[rgba(255,255,255,0.15)] mb-5">
              <span className="text-[11px] text-white font-light">+ New Conversation</span>
            </div>
            <div className="text-[10px] font-light text-[rgba(255,255,255,0.35)] tracking-wide uppercase mb-3">Personas</div>
            {DEMO_PERSONAS.map((p) => (
              <div key={p.name} className="flex items-center gap-2.5 py-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-light text-white" style={{ backgroundColor: p.color }}>
                  {p.initial}
                </div>
                <span className="text-[11px] text-white font-light">{p.name}</span>
              </div>
            ))}
          </div>

          {/* Right chat */}
          <div className="flex-1 bg-white flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(0,0,0,0.06)]">
              <div>
                <div className="text-sm font-light text-[#1D1D1F]">Startup Decision</div>
                <div className="text-[11px] text-[#86868B] font-light">3 participants</div>
              </div>
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-[rgba(0,0,0,0.05)] flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <circle cx="5" cy="4" r="2" stroke="#86868B" strokeWidth="1"/>
                    <path d="M1 10c0-2 2-3 4-3s4 1 4 3" stroke="#86868B" strokeWidth="1" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="w-6 h-6 rounded-full bg-[rgba(0,0,0,0.05)] flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M8 1L11 4L8 7" stroke="#86868B" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M1 4h10" stroke="#86868B" strokeWidth="1" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {DEMO_MESSAGES.map((m, i) => (
                <div key={i} className="flex gap-2.5">
                  {m.isUser ? (
                    <div className="flex-1 flex justify-end">
                      <div className="bg-[rgba(0,113,227,0.08)] text-[#1D1D1F] px-3 py-2 rounded-xl rounded-br-md max-w-[75%] text-xs font-light leading-relaxed">
                        {m.msg}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="w-5 h-5 rounded-full shrink-0 mt-0.5 flex items-center justify-center text-[9px] font-light text-white" style={{ backgroundColor: m.color }}>
                        {m.persona[0]}
                      </div>
                      <div className="flex-1">
                        <div className="text-[10px] font-light text-[#86868B] mb-0.5">{m.persona}</div>
                        <div className="text-xs font-light leading-relaxed text-[#1D1D1F]">{m.msg}</div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="px-4 py-3 border-t border-[rgba(0,0,0,0.06)]">
              <div className="flex items-center gap-2 bg-[#FAFAFA] rounded-xl px-3 py-2.5">
                <span className="text-[11px] text-[#86868B] font-light">Message ELARIS or @persona</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section className="max-w-5xl mx-auto px-6 pb-32 text-center">
        <button
          onClick={() => token ? router.push('/personas/new') : router.push('/register')}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-[rgba(0,0,0,0.15)] text-sm font-light text-[#1D1D1F] hover:bg-[#1D1D1F] hover:text-white transition-colors"
        >
          Start Creating a Persona
          <span>→</span>
        </button>
      </section>
    </div>
  );
}