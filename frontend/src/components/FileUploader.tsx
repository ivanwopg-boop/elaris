"use client";

import React, { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useLangStore, translations } from "@/lib/i18n";

interface FileUploaderProps {
  onFilesSelected: (files: File[]) => void;
  className?: string;
}

export function FileUploader({ onFilesSelected, className }: FileUploaderProps) {
  const { lang } = useLangStore();
  const t = translations[lang];
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    onFilesSelected(Array.from(files));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Drop zone */}
      <div
        className={cn(
          "border-2 border-dashed rounded-3xl p-8 text-center transition-all cursor-pointer",
          dragOver
            ? "border-accent-blue bg-accent-blue/5"
            : "border-border hover:border-text-secondary"
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="text-3xl mb-2">📁</div>
        <p className="text-sm text-text-secondary">{t.drag_files_here}</p>
        <p className="text-xs text-text-tertiary mt-1">{t.supported_formats}</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.txt,.md,.csv,.png,.jpg,.jpeg,.bmp,.tiff"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    </div>
  );
}