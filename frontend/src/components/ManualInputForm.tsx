"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Card } from "./ui/card";
import { Button } from "./ui/button";

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
  { key: "personality_notes", label: "Personality", placeholder: "Known personality traits..." },
];

export function ManualInputForm({ onSave, initialFields, className }: ManualInputFormProps) {
  const [fields, setFields] = useState<Record<string, string>>(initialFields || {});
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    onSave(fields);
    setSaving(false);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <h4 className="text-sm font-medium text-text-secondary">Fill in basic info manually</h4>
      {FIELD_KEYS.map(({ key, label, placeholder }) => (
        <div key={key}>
          <label className="block text-xs text-text-tertiary mb-1">{label}</label>
          <input
            value={fields[key] || ""}
            onChange={(e) => setFields((prev) => ({ ...prev, [key]: e.target.value }))}
            placeholder={placeholder}
            className="w-full bg-bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-blue"
          />
        </div>
      ))}
      <Button onClick={handleSave} loading={saving} size="sm">
        Save Info
      </Button>
    </div>
  );
}
