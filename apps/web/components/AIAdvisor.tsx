"use client";

// Floating AI advisor, grounded in the caller's real account data
// server-side (app/api/ai/advisor). 2.0 had a real version of this (Groq-
// backed, with guardrails); this is the Gemini-backed equivalent, same
// discipline — the model narrates real numbers the server already
// computed, it never invents one.

import { useState } from "react";

type Message = { role: "user" | "assistant"; text: string };

export function AIAdvisor() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: "Ask me about your usage, bill, or plan — I only answer from your real account data." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setMessages((m) => [...m, { role: "user", text: message }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/ai/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const json = await res.json();
      setMessages((m) => [...m, { role: "assistant", text: res.ok ? json.reply : `(${json.error})` }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Something went wrong — try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-30">
      {open && (
        <div
          className="mb-3 rounded-card border flex flex-col"
          style={{ width: 340, height: 420, background: "var(--color-surface-card)", borderColor: "var(--color-border)" }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
            <span className="text-sm font-semibold">EcoPower advisor</span>
            <button onClick={() => setOpen(false)} aria-label="Close" style={{ color: "var(--color-text-secondary)" }}>
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {messages.map((m, i) => (
              <div
                key={i}
                className="rounded-control px-3 py-2 text-sm max-w-[85%]"
                style={{
                  marginLeft: m.role === "user" ? "auto" : 0,
                  background: m.role === "user" ? "var(--color-categorical-third)" : "var(--color-surface)",
                  color: m.role === "user" ? "#fff" : "var(--color-text-primary)",
                  border: m.role === "assistant" ? "1px solid var(--color-border)" : "none",
                }}
              >
                {m.text}
              </div>
            ))}
            {busy && (
              <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                Thinking…
              </div>
            )}
          </div>
          <div className="p-3 border-t flex gap-2" style={{ borderColor: "var(--color-border)" }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask about your energy…"
              className="flex-1 rounded-control border px-3 py-2 text-sm bg-transparent"
              style={{ borderColor: "var(--color-border)" }}
            />
            <button
              onClick={send}
              disabled={busy}
              className="rounded-control px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--color-categorical-third)" }}
            >
              Send
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-full flex items-center justify-center text-white text-2xl transition-colors duration-state"
        style={{ width: 56, height: 56, background: "var(--color-categorical-third)" }}
        aria-label="Open AI advisor"
      >
        💬
      </button>
    </div>
  );
}
