'use client';

import { useRouter } from 'next/navigation';

export default function ChatsPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
      <div className="text-center">
        <h1 className="text-2xl font-extralight text-[#1D1D1F] mb-4">Chats</h1>
        <p className="text-[#86868B] text-sm font-light mb-8">Your conversations will appear here.</p>
        <button
          onClick={() => router.push('/personas/new')}
          className="inline-flex items-center gap-2.5 px-6 py-3 rounded-full bg-[#1D1D1F] text-white text-sm font-light hover:bg-[#3C3C3E] transition-colors"
        >
          Create a persona →
        </button>
      </div>
    </div>
  );
}