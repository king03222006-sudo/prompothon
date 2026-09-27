import { Globe, BookOpen } from "lucide-react";

export type AppMode = "interactive" | "theory";

interface ModeSwitcherProps {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
}

export function ModeSwitcher({ mode, onChange }: ModeSwitcherProps) {
  return (
    <div className="mode-switcher" role="tablist" aria-label="Application Mode">
      <button
        role="tab"
        aria-selected={mode === "interactive"}
        className={`mode-tab ${mode === "interactive" ? "mode-tab--active" : ""}`}
        onClick={() => onChange("interactive")}
        title="Switch to Interactive Mode"
      >
        <Globe className="mode-tab-icon" />
        <span className="mode-tab-label">Interactive</span>
      </button>
      <button
        role="tab"
        aria-selected={mode === "theory"}
        className={`mode-tab ${mode === "theory" ? "mode-tab--active" : ""}`}
        onClick={() => onChange("theory")}
        title="Switch to Theory Mode"
      >
        <BookOpen className="mode-tab-icon" />
        <span className="mode-tab-label">Theory</span>
      </button>
    </div>
  );
}
