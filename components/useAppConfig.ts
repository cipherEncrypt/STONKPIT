"use client";

import { useEffect, useState } from "react";
import type { AppConfig } from "@/lib/config";

export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    fetch("/api/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: AppConfig) => setConfig(d))
      .catch(() => {});
  }, []);

  return config;
}
