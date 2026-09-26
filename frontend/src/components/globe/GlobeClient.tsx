import { useEffect, useState } from "react";
import GlobeScene from "./GlobeScene";

export function GlobeClient() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs tracking-[0.4em] text-foreground/40">
        INITIALIZING ORBIT…
      </div>
    );
  }
  return <GlobeScene />;
}
