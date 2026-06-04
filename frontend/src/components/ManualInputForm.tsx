"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { useLangStore, translations } from "@/lib/i18n";

interface ManualInputFormProps {
  onSave: (fields: Record<string, string>) => void;
  initialFields?: Record<string, string>;
  className?: string;
}

const FIELD_KEYS = [
  { key: "name", label: "Name", placeholder: "Person's name" },
  { key: "title", label: "Title", placeholder: "CEO / Engineer / ..." },
  { key: "company", label: "Company", placeholder: "CompanyName" },
  { key: "background", label: "Background", placeholder: "Education, career, key moments..." },
  { key: "hobbies", label: "Hobbies", placeholder: "Hobbies, topics of interest..." },
  { key: "personality", label: "Personality", placeholder: "Known personality traits..." },
];

export function ManualInputForm({ onSave, initialFields, className }: ManualInputFormProps) {
  const { lang } = useLangStore();
  const t = translations[lang];
  const [fields, setFields] = useState<Record<string, string>>(initialFields || {});
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    onSave(fields);
    setSaving(false);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <h4 className="text-sm font-medium text-text-secondary">{t.fill_basic_info}</h4>
      {FIELD_KEYS.map(({ key, label, placeholder }) => {
        const fieldKey = `field_${key}` as keyof typeof t;
        const fieldPlaceholderKey = `field_${key}_placeholder` as keyof typeof t;
        const translatedLabel = String(t[fieldKey] || label);
        const translatedPlaceholder = String(t[fieldPlaceholderKey] || placeholder);
        return (
          <div key={key}>
            <label className="block text-xs text-text-tertiary mb-1">{translatedLabel}</label>
            <input
              value={fields[key] || ""}
              onChange={(e) => setFields((prev) => ({ ...prev, [key]: e.target.value }))}
              placeholder={translatedPlaceholder}
              className="w-full bg-bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-blue"
            />
          </div>
        );
      })}
      <Button onClick={handleSave} loading={saving} size="sm">
        {t.save_info}
      </Button>
    </div>
  );
}
