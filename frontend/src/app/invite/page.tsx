'use client';

import { useState } from 'react';
import { useLangStore, translations } from '@/lib/i18n';

export default function InvitePage() {
  const { lang } = useLangStore();
  const t = translations[lang];
  const [count, setCount] = useState(1);
  const [tier, setTier] = useState('premium');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResults([]);
    setLoading(true);

    try {
      const res = await fetch('/api/v1/auth/admin/invite-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_uses: count, tier }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed');
      }

      const data = await res.json();
      setResults([data, ...results]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = (code: string) => {
    const url = `${window.location.origin}/register?code=${code}`;
    navigator.clipboard.writeText(url);
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] py-16 px-6">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-2xl font-extralight tracking-[0.12em] text-[#1D1D1F] uppercase mb-2">Invite Codes</h1>
          <p className="text-xs text-[#86868B] font-light">Generate invite codes instantly</p>
        </div>

        <form onSubmit={generate} className="bg-white border border-[rgba(0,0,0,0.06)] rounded-[12px] p-6 space-y-5">
          {error && (
            <div className="text-xs text-red-400 text-center py-2">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#6E6E73] font-light mb-2">Quota</label>
              <input
                type="number"
                min={1}
                max={999}
                value={count}
                onChange={e => setCount(parseInt(e.target.value) || 1)}
                className="w-full bg-[#FAFAFA] border border-[rgba(0,0,0,0.08)] rounded-[8px] px-4 py-2.5 text-sm text-[#1D1D1F] focus:outline-none focus:border-[#0071E3] transition-colors font-light"
              />
            </div>
            <div>
              <label className="block text-xs text-[#6E6E73] font-light mb-2">Tier</label>
              <select
                value={tier}
                onChange={e => setTier(e.target.value)}
                className="w-full bg-[#FAFAFA] border border-[rgba(0,0,0,0.08)] rounded-[8px] px-4 py-2.5 text-sm text-[#1D1D1F] focus:outline-none focus:border-[#0071E3] transition-colors font-light"
              >
                <option value="free">Free</option>
                <option value="premium">Premium</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#1D1D1F] hover:bg-[#2a2a2e] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-light rounded-[10px] transition-colors"
          >
            {loading ? 'Generating...' : 'Generate'}
          </button>
        </form>

        {results.length > 0 && (
          <div className="mt-8 space-y-3">
            {results.map((r, i) => (
              <div key={i} className="bg-white border border-[rgba(0,0,0,0.06)] rounded-[10px] p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-light text-[#1D1D1F] tracking-wider">{r.code}</div>
                  <div className="text-xs text-[#86868B] font-light mt-1">
                    {r.tier} · {t.quota} {r.max_uses}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => copyLink(r.code)}
                    className="text-xs text-[#0071E3] hover:underline font-light"
                  >
                    Copy Link
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
