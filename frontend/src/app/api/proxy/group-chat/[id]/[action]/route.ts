// Next.js Route Handler — transparent pass-through to the backend streaming endpoint.
// Bypasses the rewrite-proxy buffering that breaks SSE.

import { cookies, headers } from "next/headers";

const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";

async function makeRequest(
  req: Request,
  id: string,
  action: string,
  method: "GET" | "POST"
) {
  const cookieHeader = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const authHdr = (await headers()).get("authorization") ?? "";
  const url = `${BACKEND}/api/v1/group-chat/${id}/${action}`;
  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers: {
      "Cookie": cookieHeader,
      ...(authHdr ? { Authorization: authHdr } : {}),
    },
    cache: "no-store",
  };
  if (method === "POST") {
    const ct = req.headers.get("content-type") ?? "application/json";
    const body = await req.text();
    init.headers = { ...(init.headers as Record<string, string>), "Content-Type": ct };
    init.body = body;
    init.duplex = "half";
  }
  return fetch(url, init);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  const { id, action } = await params;
  const upstream = await makeRequest(req, id, action, "POST");
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  const { id, action } = await params;
  const url = new URL(req.url);
  const qs = url.search;
  const cookieHeader = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const authHdr = (await headers()).get("authorization") ?? "";
  const upstream = await fetch(`${BACKEND}/api/v1/group-chat/${id}/${action}${qs}`, {
    method: "GET",
    headers: {
      "Cookie": cookieHeader,
      ...(authHdr ? { Authorization: authHdr } : {}),
    },
    cache: "no-store",
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
