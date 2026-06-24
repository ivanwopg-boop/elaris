'use client';

import { useRouter } from 'next/navigation';
import { MessageSquare, Users, BookUser, User, Activity } from 'lucide-react';
import { useLangStore, translations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const tabs = [
  { key: 'moments',  labelKey: 'tab_pulse',  icon: (s: number) => <Activity size={s} strokeWidth={1.5} /> },
  { key: 'chat',     labelKey: 'tab_chat',     icon: (s: number) => <MessageSquare size={s} strokeWidth={1.5} /> },
  { key: 'groups',   labelKey: 'tab_groups',   icon: (s: number) => <Users size={s} strokeWidth={1.5} /> },
  { key: 'contacts', labelKey: 'tab_contacts', icon: (s: number) => <BookUser size={s} strokeWidth={1.5} /> },
  { key: 'me',       labelKey: 'tab_me',       icon: (s: number) => <User size={s} strokeWidth={1.5} /> },
];

interface TabBarProps {
  active: string;
  onTabChange?: (tab: string) => void;
  unreadCount?: number; // for moments tab — shows red dot
}

export default function TabBar({ active, onTabChange, unreadCount = 0 }: TabBarProps) {
  const router = useRouter();
  const { lang } = useLangStore();
  const t = translations[lang];

  const handleTabClick = (key: string) => {
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
          const showUnread = tab.key === 'moments' && unreadCount > 0;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabClick(tab.key)}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 transition-all active:scale-[0.98] relative',
                isActive ? 'text-[#1D1D1F]' : 'text-[#86868B]'
              )}
            >
              <div className="relative">
                {tab.icon(isActive ? 22 : 20)}
                {showUnread && (
                  <span
                    className="absolute -top-0.5 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-[#FF3B30] text-white text-[9px] font-medium flex items-center justify-center ring-2 ring-white/90"
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
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
