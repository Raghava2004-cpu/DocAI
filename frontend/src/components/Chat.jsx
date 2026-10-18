import { useEffect, useRef, useState } from "react"
import { ArrowUp, Square, Copy, Check, RotateCcw, Sparkles, AlertCircle } from "lucide-react"
import Markdown from "./Markdown"

function CopyBtn({ text }) {
  const [done, setDone] = useState(false)
  return (
    <button
      className="act"
      aria-label="Copy answer"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400) } catch { /* ignore */ }
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
      <span>{done ? "Copied" : "Copy"}</span>
    </button>
  )
}

export default function Chat({ doc, busy, onAsk, onStop, onRegenerate, onCite, composerRef }) {
  const [input, setInput] = useState("")
  const endRef = useRef()
  const messages = doc.messages
  const last = messages[messages.length - 1]

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
  }, [messages.length, last?.text])

  function send(text) {
    const q = text.trim()
    if (!q || busy) return
    onAsk(q)
    setInput("")
  }

  const suggestions = doc.suggestions?.length ? doc.suggestions : null
  const asked = new Set(messages.filter(m => m.role === "user").map(m => m.text))
  const followups = (suggestions || []).filter(s => !asked.has(s)).slice(0, 3)

  return (
    <div className="chat">
      <div className="thread">
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon"><Sparkles size={18} /></div>
            <h2>What do you want to know?</h2>
            <p className="muted">
              Answers come only from <strong>{doc.name}</strong>{doc.type === "excel" ? "." : ", with page links you can click."}
            </p>
            <div className="suggest-grid">
              {(suggestions || [null, null, null, null]).map((s, i) =>
                s ? (
                  <button key={i} className="suggest" onClick={() => send(s)}>{s}</button>
                ) : (
                  <div key={i} className="suggest ghost-line" aria-hidden="true" />
                )
              )}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={m.id} className="msg-user"><p>{m.text}</p></div>
          ) : (
            <div key={m.id} className="msg-ai">
              {m.streaming && !m.text && (
                <div className="thinking"><span /><span /><span /> <em>Reading the pages</em></div>
              )}
              {m.text && <Markdown onCite={onCite} snippets={m.snippets} streaming={m.streaming}>{m.text}</Markdown>}
              {m.error && (
                <div className="msg-error"><AlertCircle size={15} /><span>{m.error}</span></div>
              )}
              {!m.streaming && (m.text || m.error) && (
                <div className="msg-actions">
                  {m.sources?.length > 0 && (
                    <div className="source-row">
                      {m.sources.map(p => (
                        <button key={p} className="source-pill" onClick={() => onCite(p)} title={m.snippets?.[String(p)] || `Open page ${p}`}>
                          Page {p}
                        </button>
                      ))}
                    </div>
                  )}
                  {m.stopped && <span className="muted small">Stopped</span>}
                  {m.text && <CopyBtn text={m.text} />}
                  {i === messages.length - 1 && (
                    <button className="act" onClick={onRegenerate} disabled={busy}>
                      <RotateCcw size={14} /><span>Try again</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        )}
        <div ref={endRef} className="thread-end" />
      </div>

      <div className="composer-wrap">
        {messages.length > 0 && followups.length > 0 && !busy && (
          <div className="followups">
            {followups.map(s => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
          </div>
        )}
        <form className="composer" onSubmit={e => { e.preventDefault(); send(input) }}>
          <textarea
            ref={composerRef}
            rows={1}
            value={input}
            placeholder={`Ask about ${doc.name}`}
            aria-label="Your question"
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input) } }}
          />
          {busy ? (
            <button type="button" className="send stop" aria-label="Stop" onClick={onStop}><Square size={14} fill="currentColor" /></button>
          ) : (
            <button className="send" aria-label="Send" disabled={!input.trim()}><ArrowUp size={18} /></button>
          )}
        </form>
        <p className="composer-hint">Enter to send, Shift + Enter for a new line. Check important facts on the page.</p>
      </div>
    </div>
  )
}
