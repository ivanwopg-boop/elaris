"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { useLangStore, translations } from "@/lib/i18n";
import { api } from "@/lib/api";
import { ChevronLeft, Eye, EyeOff } from "lucide-react";

export default function SettingsPage() {
  const router = useRouter();
  const { user, token, setAuth } = useAuthStore();
  const { lang } = useLangStore();
  const t = translations[lang];

  const [name, setName] = useState(user?.name || "");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSaveName = async () => {
    if (!name.trim()) { setError(t.please_fill_all || "Please fill all fields"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await api.updateProfile({ name: name.trim() });
      setAuth(token || "", { ...(user as any), name: name.trim() });
      setSuccess(t.saved || "Saved!");
      setTimeout(() => setSuccess(""), 2000);
    } catch (err: any) {
      setError(err.message || (t.save_failed || "Save failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!oldPassword || !newPassword || !confirmPassword) {
      setError(t.please_fill_all || "Please fill all fields");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t.password_not_match || "Passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      setError(t.password_min_6 || "Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      await api.changePassword({ old_password: oldPassword, new_password: newPassword });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(t.password_changed || "Password changed!");
      setTimeout(() => setSuccess(""), 2000);
    } catch (err: any) {
      setError(err.message || (t.save_failed || "Failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9F9F9]">
      <header className="sticky top-0 z-40 bg-white/98 backdrop-blur-md border-b border-[rgba(0,0,0,0.06)]">
        <div className="h-12 flex items-center px-4 gap-3">
          <button onClick={() => router.back()} className="text-[#86868B] hover:text-[#1D1D1F] p-1.5 -ml-1.5 rounded-full hover:bg-[rgba(0,0,0,0.04)] transition-colors">
            <ChevronLeft size={20} strokeWidth={1.5} />
          </button>
          <h1 className="text-base font-light tracking-wide text-[#1D1D1F]">{t.account_settings || "Account Settings"}</h1>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6 space-y-4">
        {error && <div className="text-xs text-red-500 text-center py-2">{error}</div>}
        {success && <div className="text-xs text-green-600 text-center py-2">{success}</div>}

        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] p-5">
          <h2 className="text-sm font-normal text-[#1D1D1F] mb-4">{t.profile || "Profile"}</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-[#86868B] font-light mb-1">{t.your_name || "Name"}</label>
              <div className="flex gap-2">
                <input type="text" value={name} onChange={e => setName(e.target.value)} className="flex-1 bg-[#F5F5F7] border border-[rgba(0,0,0,0.06)] rounded-xl px-4 py-3 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#1D1D1F] transition-colors font-light" placeholder={t.your_name || "Your name"} />
                <button onClick={handleSaveName} disabled={loading} className="px-5 py-3 rounded-xl bg-[#1D1D1F] text-white text-sm font-light hover:bg-[#3C3C3E] active:bg-[#000] disabled:opacity-40 transition-colors">
                  {t.save || "Save"}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-[#86868B] font-light mb-1">{t.email_address || "Email"}</label>
              <div className="bg-[#F5F5F7] border border-[rgba(0,0,0,0.06)] rounded-xl px-4 py-3 text-sm text-[#86868B] font-light">{user?.email || "-"}</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] p-5">
          <h2 className="text-sm font-normal text-[#1D1D1F] mb-4">{t.change_password || "Change Password"}</h2>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label className="block text-xs text-[#86868B] font-light mb-1">{t.current_password || "Current Password"}</label>
              <div className="relative"><input type={showPassword ? "text" : "password"} value={oldPassword} onChange={e => setOldPassword(e.target.value)} className="pr-12 w-full bg-[#F5F5F7] border border-[rgba(0,0,0,0.06)] rounded-xl px-4 py-3 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#1D1D1F] transition-colors font-light" placeholder={t.current_password || "Current password"} /><button type="button" onClick={() => setShowPassword(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868B] hover:text-[#1D1D1F] p-1" tabIndex={-1}>{showPassword ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}</button></div>
            </div>
            <div>
              <label className="block text-xs text-[#86868B] font-light mb-1">{t.new_password || "New Password"}</label>
              <div className="relative"><input type={showPassword ? "text" : "password"} value={newPassword} onChange={e => setNewPassword(e.target.value)} className="pr-12 w-full bg-[#F5F5F7] border border-[rgba(0,0,0,0.06)] rounded-xl px-4 py-3 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#1D1D1F] transition-colors font-light" placeholder={t.new_password || "New password"} /><button type="button" onClick={() => setShowPassword(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868B] hover:text-[#1D1D1F] p-1" tabIndex={-1}>{showPassword ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}</button></div>
            </div>
            <div>
              <label className="block text-xs text-[#86868B] font-light mb-1">{t.confirm_password || "Confirm Password"}</label>
              <div className="relative"><input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="pr-12 w-full bg-[#F5F5F7] border border-[rgba(0,0,0,0.06)] rounded-xl px-4 py-3 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#1D1D1F] transition-colors font-light" placeholder={t.confirm_password || "Confirm password"} /><button type="button" onClick={() => setShowPassword(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868B] hover:text-[#1D1D1F] p-1" tabIndex={-1}>{showPassword ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}</button></div>
            </div>
            <button type="submit" disabled={loading} className="w-full py-3.5 rounded-xl bg-[#1D1D1F] text-white text-sm font-light hover:bg-[#3C3C3E] active:bg-[#000] disabled:opacity-40 transition-colors mt-2">
              {loading ? (t.changing_password || "Changing...") : (t.change_password || "Change Password")}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}