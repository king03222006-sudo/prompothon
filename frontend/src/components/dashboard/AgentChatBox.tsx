import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

/* ─── constants ─────────────────────────────────────────────────────────────── */

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || "";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are AEGIS, an intelligent disaster management AI assistant. 
You help users understand disaster events, coordinate emergency response, analyze risk, and provide actionable insights.
Be concise, clear, and helpful. Use bullet points when listing items. Keep responses focused and relevant.`;

const SUGGESTIONS = [
  "What is an M7.2 earthquake?",
  "How to coordinate flood response?",
  "Explain disaster risk assessment",
  "What is a supply corridor?",
  "Steps for evacuation planning",
];

/* ─── types ─────────────────────────────────────────────────────────────────── */

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  timestamp: Date;
}

interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/* ─── AgentChatBox component ─────────────────────────────────────────────── */

export function AgentChatBox() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "agent",
      text: "👋 Hi! I'm **AEGIS**, your disaster management AI assistant.\n\nAsk me anything about disaster response, risk assessment, or emergency coordination.",
      timestamp: new Date(),
    },
  ]);
  const [history, setHistory] = useState<GroqMessage[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typing]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  /* ─── send ─────────────────────────────────────────────────────────────── */

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || typing) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setTyping(true);

    const newHistory: GroqMessage[] = [
      ...history,
      { role: "user", content: text },
    ];

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            // Keep last 10 messages for context window
            ...newHistory.slice(-10),
          ],
          temperature: 0.7,
          max_tokens: 1024,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const reply: string = data.choices?.[0]?.message?.content ?? "No response received.";

      const updatedHistory: GroqMessage[] = [
        ...newHistory,
        { role: "assistant", content: reply },
      ];
      setHistory(updatedHistory);

      const agentMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "agent",
        text: reply,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, agentMsg]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: "agent",
        text: `❌ **Error:** ${err instanceof Error ? err.message : "Failed to reach AI. Check your API key."}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setTyping(false);
    }
  }, [input, typing, history]);

  /* ─── clear ─────────────────────────────────────────────────────────────── */

  const handleClear = useCallback(() => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: "agent",
        text: "Chat cleared. How can I help you?",
        timestamp: new Date(),
      },
    ]);
    setHistory([]);
  }, []);

  /* ─── render text ────────────────────────────────────────────────────────── */

  function renderText(text: string) {
    return text.split("\n").map((line, i) => {
      const isBullet = line.trim().startsWith("- ") || line.trim().startsWith("* ");
      const content = isBullet ? line.trim().slice(2) : line;

      const parsed = content.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((part, j) => {
        if (part.startsWith("**") && part.endsWith("**"))
          return <span key={j} className="font-semibold text-white">{part.slice(2, -2)}</span>;
        if (part.startsWith("*") && part.endsWith("*"))
          return <em key={j} className="text-white/70 not-italic font-medium">{part.slice(1, -1)}</em>;
        if (part.startsWith("`") && part.endsWith("`"))
          return <code key={j} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px] text-sky-200">{part.slice(1, -1)}</code>;
        return part;
      });

      if (isBullet) {
        return (
          <div key={i} className="flex items-start gap-1.5 ml-2 mt-0.5">
            <span className="text-sky-300 mt-0.5">•</span>
            <div>{parsed}</div>
          </div>
        );
      }
      return (
        <div key={i} className={line.trim() === "" ? "h-2" : "min-h-[1.2em]"}>
          {parsed}
        </div>
      );
    });
  }

  /* ─── floating trigger ───────────────────────────────────────────────────── */

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="pointer-events-auto fixed bottom-20 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/90 to-emerald-500/90 text-white shadow-[0_0_24px_rgba(56,189,248,0.35)] transition-all duration-280 hover:scale-110 hover:shadow-[0_0_40px_rgba(56,189,248,0.55)]"
        aria-label="Open AI Chat"
      >
        <MessageSquare className="h-5 w-5" />
        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-400 text-[7px] font-bold text-black">
          AI
        </span>
      </button>
    );
  }

  /* ─── chat panel ─────────────────────────────────────────────────────────── */

  return (
    <div
      className={`pointer-events-auto fixed right-5 z-50 flex flex-col glass-panel transition-all duration-280 ${
        minimized ? "bottom-20 h-12 w-[400px]" : "bottom-20 h-[500px] w-[400px]"
      }`}
    >
      {/* ── header ── */}
      <div
        className="flex shrink-0 cursor-pointer items-center justify-between border-b border-white/[0.06] px-4 py-3"
        onClick={() => setMinimized((m) => !m)}
      >
        <div className="flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400/30 to-emerald-400/20 ring-1 ring-white/10 shrink-0">
            <Bot className="h-4 w-4 text-sky-300" />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-[#0a0d14]" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-medium text-white/90">AEGIS Assistant</span>
              <span className="flex items-center gap-1 rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[8px] text-emerald-200">
                <Sparkles className="h-2 w-2" /> Online
              </span>
            </div>
            <div className="text-[9px] text-white/30 mt-0.5">Powered by Llama 3.3 · Groq</div>
          </div>
        </div>

        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={handleClear}
            title="Clear chat"
            className="rounded p-1 text-white/40 hover:bg-white/5 hover:text-rose-300 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {minimized ? (
            <ChevronUp
              onClick={() => setMinimized(false)}
              className="h-4 w-4 cursor-pointer text-white/40 hover:text-white"
            />
          ) : (
            <ChevronDown
              onClick={() => setMinimized(true)}
              className="h-4 w-4 cursor-pointer text-white/40 hover:text-white"
            />
          )}
          <button
            onClick={() => setOpen(false)}
            className="rounded p-1 text-white/40 hover:bg-white/5 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* ── messages ── */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
            style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "agent" && (
                  <div className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400/30 to-emerald-400/20">
                    <Bot className="h-3 w-3 text-sky-300" />
                  </div>
                )}
                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed ${
                    msg.role === "user"
                      ? "rounded-br-md bg-sky-500/20 text-white/90 border border-sky-400/20"
                      : "rounded-bl-md bg-white/[0.05] text-white/80 border border-white/[0.06]"
                  }`}
                >
                  <div>{renderText(msg.text)}</div>
                  <div className="mt-1 text-[9px] text-white/20">
                    {msg.timestamp.toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </div>
                </div>
              </div>
            ))}

            {typing && (
              <div className="flex justify-start">
                <div className="ml-8 flex items-center gap-2 rounded-2xl rounded-bl-md border border-white/[0.04] bg-white/[0.04] px-3.5 py-2.5">
                  <Loader2 className="h-3 w-3 animate-spin text-sky-300/70" />
                  <span className="text-[11px] text-white/35">Thinking…</span>
                </div>
              </div>
            )}
          </div>

          {/* ── suggestions ── */}
          <div
            className="shrink-0 flex gap-1.5 overflow-x-auto border-t border-white/[0.04] px-3 py-2"
            style={{ scrollbarWidth: "none" }}
          >
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setInput(s);
                  setTimeout(() => inputRef.current?.focus(), 50);
                }}
                className="shrink-0 rounded-full border border-white/[0.06] px-2.5 py-1 text-[9px] text-white/30 transition-colors hover:border-sky-400/30 hover:bg-sky-400/5 hover:text-white/60"
              >
                {s}
              </button>
            ))}
          </div>

          {/* ── input ── */}
          <div className="shrink-0 border-t border-white/[0.06] px-3 py-2.5">
            <div className="relative flex items-center gap-2 glass-input px-3 py-2 focus-within:!border-sky-400/30 transition-all">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask anything about disaster management…"
                disabled={typing}
                className="flex-1 bg-transparent text-[12px] text-white/85 placeholder:text-white/25 outline-none disabled:opacity-50"
                autoFocus
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || typing}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/20 text-sky-300 transition-all hover:bg-sky-500/35 disabled:opacity-30"
              >
                {typing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <div className="mt-1.5 px-1 text-[9px] text-white/20">
              Press Enter to send · Groq AI · Study project
            </div>
          </div>
        </>
      )}
    </div>
  );
}
