"use client";

import { useEffect, useState } from "react";
import { X, Download } from "lucide-react";

/**
 * PWA install banner. Listens for the browser's beforeinstallprompt event
 * and offers a "Add to Home Screen" CTA. Dismissed state is remembered
 * for 7 days in localStorage.
 */
export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Already dismissed recently?
    const last = parseInt(localStorage.getItem("pwa-dismissed-at") || "0", 10);
    if (Date.now() - last < 7 * 24 * 60 * 60 * 1000) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setShow(false);
    setDeferredPrompt(null);
  };

  const dismiss = () => {
    localStorage.setItem("pwa-dismissed-at", String(Date.now()));
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:bottom-4 sm:w-[360px] z-50 pwa-install-banner">
      <div className="bg-white rounded-2xl shadow-2xl border border-[rgba(0,0,0,0.08)] p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#0071E3] flex items-center justify-center shrink-0">
          <Download size={18} className="text-white" strokeWidth={1.5} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#1D1D1F] mb-0.5">Add Elaris to Home</p>
          <p className="text-xs text-[#86868B] font-light leading-snug">
            Install for one-tap access and full-screen mode.
          </p>
          <div className="flex gap-2 mt-2.5">
            <button
              onClick={install}
              className="px-3.5 py-1.5 rounded-full bg-[#1D1D1F] text-white text-xs font-light hover:bg-[#3C3C3E] active:scale-95 transition-all"
            >
              Install
            </button>
            <button
              onClick={dismiss}
              className="px-3.5 py-1.5 rounded-full text-[#86868B] text-xs font-light hover:bg-[#F5F5F7] transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          onClick={dismiss}
          className="text-[#86868B] hover:text-[#1D1D1F] p-1 -mr-1 -mt-1 shrink-0"
          aria-label="Dismiss"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
