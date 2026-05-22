"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Card } from "./ui/card";
import { Button } from "./ui/button";

interface WebSearchPanelProps {
  personaId: string;
  onSearch: (queries: string[]) => Promise<void>;
  results: { query: string; results: any[] }[];
  className?: string;
}

export function WebSearchPanel({ personaId, onSearch, results, className }: WebSearchPanelProps) {
  const [customQuery, setCustomQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [autoQueries, setAutoQueries] = useState<string[]>([]);

  const startSearch = async (queries: string[]) => {
    setSearching(true);
    try {
      await onSearch(queries);
    } finally {
      setSearching(false);
    }
  };

  const addCustomQuery = () => {
    const q = customQuery.trim();
    if (q) {
      setAutoQueries((prev) => [...prev, q]);
      setCustomQuery("");
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <h4 className="text-sm font-medium text-text-secondary">Web Search</h4>

      <Button
        size="sm"
        loading={searching}
        onClick={() => startSearch(autoQueries.length > 0 ? autoQueries : ["default search"])}
      >
        🔍 Start Web Search
      </Button>

      {/* Custom query */}
      <div className="flex gap-2">
        <input
          value={customQuery}
          onChange={(e) => setCustomQuery(e.target.value)}
          placeholder="Add custom search query..."
          className="flex-1 bg-bg-card border border-border rounded-xl px-4 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-blue"
          onKeyDown={(e) => e.key === "Enter" && addCustomQuery()}
        />
        <button
          onClick={addCustomQuery}
          className="px-3 py-2 bg-bg-card border border-border rounded-xl text-sm text-text-secondary hover:bg-bg-card-hover"
        >
          +
        </button>
      </div>

      {/* Custom queries list */}
      {autoQueries.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {autoQueries.map((q, i) => (
            <span key={i} className="px-2 py-1 bg-bg-card rounded-lg text-xs text-text-secondary flex items-center gap-1">
              {q}
              <button onClick={() => setAutoQueries((prev) => prev.filter((_, j) => j !== i))}>✕</button>
            </span>
          ))}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2 mt-4">
          <p className="text-xs text-text-tertiary">Search results:</p>
          {results.map((r, i) => (
            <Card key={i} className="p-3">
              <p className="text-xs font-medium text-text-secondary mb-1">Search：{r.query}</p>
              {r.results?.slice(0, 3).map((item: any, j: number) => (
                <div key={j} className="text-xs text-text-tertiary py-1 border-t border-border/50">
                  <a href={item.url} target="_blank" className="text-accent-blue hover:underline">{item.title}</a>
                  <p className="mt-0.5">{item.snippet}</p>
                </div>
              ))}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}


