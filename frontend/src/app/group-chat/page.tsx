"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api, GroupChatOut } from "@/lib/api";
import { formatDate } from "@/lib/utils";

export default function GroupChatsPage() {
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
          <h1 className="text-2xl font-extralight tracking-tight">Group Chat</h1>
          <p className="text-sm text-[#86868B] font-light mt-1">Chat with multiple personas in the same conversation</p>
        </div>
        <Button onClick={() => router.push("/group-chat/new")}>Create Group Chat</Button>
      </div>

      {loading && <p className="text-center text-[#86868B] text-sm font-light py-12">Loading...</p>}

      {!loading && chats.length === 0 && (
        <div className="text-center py-24">
          <p className="text-[#86868B] text-sm font-light mb-4">No group chats yet. Create one to chat with multiple personas</p>
          <Button onClick={() => router.push("/group-chat/new")}>Create Group Chat</Button>
        </div>
      )}

      <div className="space-y-3">
        {chats.map((c) => (
          <Card key={c.id} hover onClick={() => router.push(`/group-chat/${c.id}`)} className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <h3 className="font-light text-sm">{c.title}</h3>
              <p className="text-xs text-[#86868B] font-light mt-1">
                {c.persona_ids.length} people · {c.message_count} messages · {formatDate(c.created_at)}
              </p>
            </div>
            <span className="text-xs text-[#86868B] font-light shrink-0">Enter →</span>
          </Card>
        ))}
      </div>
    </div>
  );
}