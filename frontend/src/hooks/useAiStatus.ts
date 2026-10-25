import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AiStatus } from "@/lib/types";

let cache: AiStatus | null = null;
export function useAiStatus(force = 0) {
  const [s, setS] = useState<AiStatus | null>(cache);
  useEffect(() => {
    let live = true;
    api.system.aiStatus().then((r) => { cache = r; if (live) setS(r); }).catch(() => {});
    return () => { live = false; };
  }, [force]);
  return s;
}
