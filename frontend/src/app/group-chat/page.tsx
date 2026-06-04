"use client";

import { useEffect, useState } from "react";
import { useLangStore, translations } from '@/lib/i18n';
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api, GroupChatOut } from "@/lib/api";
import { formatDate } from "@/lib/utils";

export default function GroupChatsPage() {
  const { lang } = useLangStore();
  const t = translations[lang];
  const router = useRouter();
  const [chats, setChats] = useState<GroupChatOut[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listGroupChats().then(setChats).catch(console.error).finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-2xl font-extralight tracking-tight">{t.group_title}</h1>
          <p className="text-sm text-[#86868B] font-light mt-1">{t.group_subtitle}</p>
        </div>
        <Button onClick={() => router.push("/group-chat/new")}>{t.create_group_chat}</Button>
      </div>

      {loading && <p className="text-center text-[#86868B] text-sm font-light py-12">Loading...</p>}

      {!loading && chats.length === 0 && (
        <div className="text-center py-24">
          <p className="text-[#86868B] text-sm font-light mb-4">{t.no_group_chats}</p>
          <Button onClick={() => router.push("/group-chat/new")}>{t.create_group_chat}</Button>
        </div>
      )}

      <div className="space-y-3">
        {chats.map((c) => (
          <Card key={c.id} hover onClick={() => router.push(`/group-chat/${c.id}`)} className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <h3 className="font-light text-sm">{c.title}</h3>
              <p className="text-xs text-[#86868B] font-light mt-1">
                {c.persona_ids.length}{t.people} · {c.message_count}{t.messages} · {formatDate(c.created_at)}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-[#86868B] font-light shrink-0">{t.enter_group} →</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("Delete this group chat?")) api.deleteGroupChat(c.id).then(() => setChats((prev) => prev.filter((x) => x.id !== c.id)));
                }}
                className="text-[#86868B] hover:text-red-400 text-lg font-light leading-none transition-colors"
              >{t.close}</button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}