'use client';

import { useRouter } from 'next/navigation';
import { MessageSquare, Users, Compass, User } from 'lucide-react';
import { useLangStore, translations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const tabs = [
  { key: 'chat', labelKey: 'tab_chat', icon: (s: number) => <MessageSquare size={s} strokeWidth={1.5} /> },
  { key: 'contacts', labelKey: 'tab_contacts', icon: (s: number) => <Users size={s} strokeWidth={1.5} /> },
  { key: 'discover', labelKey: 'tab_discover', icon: (s: number) => <Compass size={s} strokeWidth={1.5} /> },
  { key: 'me', labelKey: 'tab_me', icon: (s: number) => <User size={s} strokeWidth={1.5} /> },
];

interface TabBarProps {
  active: string;
  onTabChange?: (tab: string) => void;
}

export default function TabBar({ active, onTabChange }: TabBarProps) {
  const router = useRouter();
  const { lang } = useLangStore();
  const t = translations[lang];

  const handleTabClick = (key: string) => {
    // Immediate callback for instant tab switch (no router.push here to avoid re-render)
    if (onTabChange) {
      onTabChange(key);
    }
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-md border-t border-[rgba(0,0,0,0.06)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex h-14">
        {tabs.map((tab) => {
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabClick(tab.key)}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 transition-all active:scale-[0.98]',
                isActive ? 'text-[#1D1D1F]' : 'text-[#86868B]'
              )}
            >
              {tab.icon(isActive ? 22 : 20)}
              <span className={cn('text-[10px]', isActive ? 'font-normal text-[#1D1D1F]' : 'font-light text-[#86868B]')}>
                {String(t[tab.labelKey] || tab.labelKey)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}