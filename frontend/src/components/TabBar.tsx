'use client';

import React from 'react';
import { MessageSquare, Users, Compass, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TabKey = 'chat' | 'contacts' | 'discover' | 'me';

interface TabBarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'chat', label: 'Chat', icon: <MessageSquare size={20} strokeWidth={1.5} /> },
  { key: 'contacts', label: 'Contacts', icon: <Users size={20} strokeWidth={1.5} /> },
  { key: 'discover', label: 'Discover', icon: <Compass size={20} strokeWidth={1.5} /> },
  { key: 'me', label: 'Me', icon: <User size={20} strokeWidth={1.5} /> },
];

export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[rgba(0,0,0,0.06)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="max-w-lg mx-auto flex items-center justify-around h-14">
        {TABS.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors',
              activeTab === key
                ? 'text-[#1D1D1F]'
                : 'text-[#86868B] hover:text-[#3C3C3E]'
            )}
          >
            <span className="relative">
              {icon}
              {activeTab === key && (
                <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#0071E3]" />
              )}
            </span>
            <span className="text-[10px] font-light tracking-wide">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}