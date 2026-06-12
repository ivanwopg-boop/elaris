export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#F5F5F7]">
      <div className="bg-white border-b border-[rgba(0,0,0,0.06)] px-6 pt-12 pb-10 text-center">
        <h1 className="text-2xl font-light text-[#1D1D1F] mb-2 tracking-wide">Terms of Service</h1>
        <p className="text-sm text-[#86868B] font-light">Last updated: June 12, 2026</p>
      </div>
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-8 text-sm text-[#6E6E73] leading-relaxed">
        <section>
          <h2 className="text-base font-medium text-[#1D1D1F] mb-3">1. What is Elaris</h2>
          <p>Elaris is an interactive computer service — a tool, not a content platform. We provide technology for you to create and interact with AI Personas. You control what Personas you create and what you talk about.</p>
        </section>
        <section>
          <h2 className="text-base font-medium text-[#1D1D1F] mb-3">2. Your Responsibilities</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>You are responsible for all AI Personas you create and all content you generate</li>
            <li>Do not create Personas of private individuals without their consent</li>
            <li>Do not use AI Personas as substitutes for professional medical, legal, or financial advice</li>
            <li>Do not use the platform for harassment, fraud, or exploitation of minors</li>
          </ul>
        </section>
        <section>
          <h2 className="text-base font-medium text-[#1D1D1F] mb-3">3. Age Requirements</h2>
          <p>You must be at least 13 years old to use Elaris (16 in the EU/UK). Users aged 13-16 are placed in a restricted mode with additional safety protections.</p>
        </section>
        <section>
          <h2 className="text-base font-medium text-[#1D1D1F] mb-3">4. AI-Generated Content</h2>
          <p>All AI Personas are AI-generated simulations. They are not real people. No AI Persona represents the actual views of any real individual. In compliance with the EU AI Act, all AI-generated content is labeled.</p>
        </section>
        <section>
          <h2 className="text-base font-medium text-[#1D1D1F] mb-3">5. Safety & Crisis</h2>
          <p>Our platform includes safety filters for self-harm, violence, and child safety content. If you are in crisis, please call 988 (US), 112 (EU), or 116 123 (UK).</p>
        </section>
        <section>
          <h2 className="text-base font-medium text-[#1D1D1F] mb-3">6. Full Legal Document</h2>
          <p>The complete Terms of Service with all legal provisions is available on request. This summary is for informational purposes only and does not replace the full legal document.</p>
        </section>
      </div>
    </div>
  )
}
