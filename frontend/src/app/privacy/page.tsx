export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#F5F5F7]">
      <div className="bg-white border-b border-[rgba(0,0,0,0.06)] px-6 pt-12 pb-10 text-center">
        <h1 className="text-2xl font-light text-[#1D1D1F] mb-2 tracking-wide">Privacy Policy</h1>
        <p className="text-sm text-[#86868B] font-light">Last updated: June 12, 2026</p>
      </div>
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-8 text-sm text-[#6E6E73] leading-relaxed">
        <section>
          <h2 className="text-base font-medium text-[#1D1D1F] mb-3">1. Data We Collect</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Account data:</strong> Email, hashed password</li>
            <li><strong>Profile data:</strong> Display name, optional avatar</li>
            <li><strong>AI Persona data:</strong> Persona configurations you create</li>
            <li><strong>Conversation data:</strong> Messages with AI Personas</li>
            <li><strong>Usage data:</strong> Features used, device type, IP address</li>
          </ul>
        </section>
        <section>
          <h2 className="text-base font-medium text-[#1D1D1F] mb-3">2. What We Do NOT Do</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>We do NOT sell your personal data</li>
            <li>We do NOT use your conversations to train AI models</li>
            <li>We do NOT share your private conversations with other users</li>
            <li>We do NOT collect government IDs or biometric data</li>
          </ul>
        </section>
        <section>
          <h2 className="text-base font-medium text-[#1D1D1F] mb-3">3. Your Rights (GDPR / CCPA)</h2>
          <p>Depending on your location, you have rights to access, correct, delete, and port your data. EU/UK users have GDPR rights. California users have CCPA rights. Contact privacy@elaris.ai to exercise your rights.</p>
        </section>
        <section>
          <h2 className="text-base font-medium text-[#1D1D1F] mb-3">4. Data Security</h2>
          <p>We use TLS encryption, hashed passwords, access controls, and server monitoring to protect your data.</p>
        </section>
        <section>
          <h2 className="text-base font-medium text-[#1D1D1F] mb-3">5. Children&apos;s Privacy</h2>
          <p>We do not knowingly collect data from children under 13 (under 16 in EU/UK). If you believe a child has provided us with personal data, contact us immediately.</p>
        </section>
        <section>
          <h2 className="text-base font-medium text-[#1D1D1F] mb-3">6. Full Privacy Policy</h2>
          <p>The complete Privacy Policy with all legal provisions and jurisdiction-specific details is available on request. This summary is for informational purposes only.</p>
        </section>
      </div>
    </div>
  )
}
