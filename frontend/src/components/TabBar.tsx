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
  { key: 'chat', label: '聊天', icon: <MessageSquare size={22} strokeWidth={1.5} /> },
  { key: 'contacts', label: '通讯录', icon: <Users size={22} strokeWidth={1.5} /> },
  { key: 'discover', label: '发现', icon: <Compass size={22} strokeWidth={1.5} /> },
  { key: 'me', label: '我', icon: <User size={22} strokeWidth={1.5} /> },
];

export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white/98 backdrop-blur-md border-t border-[rgba(0,0,0,0.08)]"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        // Ensure it never bleeds beyond screen edges
        maxWidth: '100vw',
        overflowX: 'hidden',
      }}
    >
      <div
        className="max-w-lg mx-auto flex items-stretch"
        style={{
          height: 'calc(56px + env(safe-area-inset-bottom, 0px))',
          minHeight: '56px',
        }}
      >
        {TABS.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            // Minimum tap target 44×44px, flex-1 for equal distribution
            className={cn(
              'flex flex-col items-center justify-center flex-1',
              'text-[13px] font-light tracking-wide',
              'transition-colors select-none touch-manipulation',
              'active:bg-[rgba(0,0,0,0.04)]',
              activeTab === key
                ? 'text-[#1D1D1F]'
                : 'text-[#8E8E93]'
            )}
            style={{ minHeight: '56px' }}
            aria-label={label}
          >
            <span className="relative mb-1">
              {icon}
              {activeTab === key && (
                <span
                  className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#0071E3]"
                />
              )}
            </span>
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}