import { useState, useRef } from "react"

const API = import.meta.env.VITE_API_URL || "http://localhost:8000"

function App() {
  const [session, setSession] = useState(null)        // {session_id, type, filename}
  const [tab, setTab] = useState("chat")              // chat | quiz | summary
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState("")
  const [quiz, setQuiz] = useState([])
  const [answers, setAnswers] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [quizConfig, setQuizConfig] = useState({ num: 5, difficulty: "medium" })
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()

  // Safe fetch helper — handles non-JSON error responses
  async function safeFetch(url, options) {
    const res = await fetch(url, options)
    const text = await res.text()
    if (!res.ok) {
      let msg = text.slice(0, 300)
      try { msg = JSON.parse(text)?.detail || msg } catch {}
      throw new Error(`Server error ${res.status}: ${msg}`)
    }
    try { return JSON.parse(text) }
    catch { throw new Error(`Invalid response: ${text.slice(0, 200)}`) }
  }

  async function handleFile(file) {
    if (!file) return
    setUploading(true)
    setSession(null); setMessages([]); setSummary(""); setQuiz([]); setAnswers({}); setSubmitted(false)
    const form = new FormData()
    form.append("file", file)
    try {
      const data = await safeFetch(`${API}/upload`, { method: "POST", body: form })
      setSession(data)
      setMessages([{ role: "assistant", text: `✅ **${data.filename}** uploaded! Ask me anything about it.` }])
      setTab("chat")
    } catch (e) {
      alert(e.message)
    } finally {
      setUploading(false)
    }
  }

  async function sendMessage() {
    if (!input.trim() || !session) return
    const q = input.trim()
    setInput("")
    setMessages(m => [...m, { role: "user", text: q }])
    setLoading(true)
    try {
      const data = await safeFetch(`${API}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: session.session_id, question: q })
      })
      setMessages(m => [...m, { role: "assistant", text: data.answer }])
    } catch (e) {
      setMessages(m => [...m, { role: "assistant", text: `❌ ${e.message}` }])
    } finally {
      setLoading(false)
    }
  }

  async function fetchSummary() {
    if (!session) return
    setLoading(true); setSummary("")
    try {
      const data = await safeFetch(`${API}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: session.session_id })
      })
      setSummary(data.summary || "No summary returned.")
    } catch (e) { setSummary(`❌ ${e.message}`) }
    finally { setLoading(false) }
  }

  async function fetchQuiz() {
    if (!session) return
    setLoading(true); setQuiz([]); setAnswers({}); setSubmitted(false)
    try {
      const data = await safeFetch(`${API}/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: session.session_id, num_questions: quizConfig.num, difficulty: quizConfig.difficulty })
      })
      setQuiz(data.questions || [])
    } catch (e) { alert(`❌ ${e.message}`) }
    finally { setLoading(false) }
  }

  const norm = (s) => (s || "").trim().toLowerCase()
  const score = quiz.filter((q, i) => norm(answers[i]) === norm(q.answer)).length

  const s = styles
  return (
    <div style={s.root}>
      {/* Sidebar */}
      <div style={s.sidebar}>
        <div style={s.logo}>📄 DocAI</div>

        {/* Upload zone */}
        <div
          style={{ ...s.dropzone, ...(dragOver ? s.dropzoneActive : {}) }}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
          onClick={() => fileRef.current.click()}
        >
          <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.csv" style={{ display: "none" }}
            onChange={e => handleFile(e.target.files[0])} />
          {uploading ? <span style={s.uploadHint}>Uploading…</span> : (
            <>
              <span style={{ fontSize: 28 }}>⬆️</span>
              <span style={s.uploadHint}>Drop PDF / Excel / CSV</span>
              <span style={{ ...s.uploadHint, fontSize: 11, opacity: 0.6 }}>or click to browse</span>
            </>
          )}
        </div>

        {session && (
          <div style={s.fileTag}>
            <span style={{ fontSize: 16 }}>{session.type === "pdf" ? "📄" : "📊"}</span>
            <span style={{ fontSize: 12, wordBreak: "break-all" }}>{session.filename}</span>
          </div>
        )}

        {/* Nav */}
        {session && (
          <nav style={s.nav}>
            {["chat", "summary", "quiz"].map(t => (
              <button key={t} style={{ ...s.navBtn, ...(tab === t ? s.navBtnActive : {}) }}
                onClick={() => { setTab(t); if (t === "summary" && !summary) fetchSummary(); if (t === "quiz") {} }}>
                {{ chat: "💬 Chat", summary: "📝 Summary", quiz: "🧠 Quiz" }[t]}
              </button>
            ))}
          </nav>
        )}
      </div>

      {/* Main */}
      <div style={s.main}>
        {!session && (
          <div style={s.empty}>
            <div style={{ fontSize: 56 }}>📂</div>
            <h2 style={{ margin: "12px 0 6px", fontWeight: 600 }}>Upload a file to get started</h2>
            <p style={{ color: "#888", fontSize: 14 }}>Supports PDF, Excel (.xlsx/.xls), and CSV files</p>
          </div>
        )}

        {/* CHAT TAB */}
        {session && tab === "chat" && (
          <div style={s.chatWrap}>
            <div style={s.messages}>
              {messages.map((m, i) => (
                <div key={i} style={{ ...s.bubble, ...(m.role === "user" ? s.bubbleUser : s.bubbleBot) }}>
                  <span style={s.bubbleRole}>{m.role === "user" ? "You" : "AI"}</span>
                  <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{m.text}</p>
                </div>
              ))}
              {loading && <div style={{ ...s.bubble, ...s.bubbleBot }}><span style={s.bubbleRole}>AI</span><p style={{ margin: 0, color: "#999" }}>Thinking…</p></div>}
            </div>
            <div style={s.inputRow}>
              <input style={s.input} value={input} placeholder="Ask a question about your file…"
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()} />
              <button style={s.sendBtn} onClick={sendMessage} disabled={loading || !input.trim()}>Send</button>
            </div>
          </div>
        )}

        {/* SUMMARY TAB */}
        {session && tab === "summary" && (
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <h2 style={s.panelTitle}>Document Summary</h2>
              <button style={s.outlineBtn} onClick={fetchSummary} disabled={loading}>
                {loading ? "Generating…" : "🔄 Regenerate"}
              </button>
            </div>
            {summary
              ? <div style={s.summaryBox}>{summary}</div>
              : <div style={s.placeholder}>{loading ? "Generating summary…" : "Click Regenerate to get a summary."}</div>
            }
          </div>
        )}

        {/* QUIZ TAB */}
        {session && tab === "quiz" && (
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <h2 style={s.panelTitle}>Quiz Generator</h2>
            </div>

            {/* Config */}
            {!quiz.length && (
              <div style={s.quizConfig}>
                <label style={s.label}>Questions
                  <select style={s.select} value={quizConfig.num} onChange={e => setQuizConfig(q => ({ ...q, num: +e.target.value }))}>
                    {[3, 5, 7, 10].map(n => <option key={n}>{n}</option>)}
                  </select>
                </label>
                <label style={s.label}>Difficulty
                  <select style={s.select} value={quizConfig.difficulty} onChange={e => setQuizConfig(q => ({ ...q, difficulty: e.target.value }))}>
                    {["easy", "medium", "hard"].map(d => <option key={d}>{d}</option>)}
                  </select>
                </label>
                <button style={s.primaryBtn} onClick={fetchQuiz} disabled={loading}>
                  {loading ? "Generating…" : "⚡ Generate Quiz"}
                </button>
              </div>
            )}

            {/* Questions */}
            {quiz.length > 0 && (
              <div>
                {quiz.map((q, qi) => {
                  // Normalize comparison: trim + lowercase to avoid whitespace/case bugs
                  const normalize = (s) => (s || "").trim().toLowerCase()
                  const correctNorm = normalize(q.answer)
                  const selectedNorm = normalize(answers[qi])
                  const isAnsweredCorrectly = selectedNorm === correctNorm

                  return (
                  <div key={qi} style={s.questionCard}>
                    <p style={s.questionText}>{qi + 1}. {q.question}</p>
                    <div style={s.options}>
                      {q.options.map((opt, oi) => {
                        const optNorm = normalize(opt)
                        const isSelected = normalize(answers[qi]) === optNorm
                        const isCorrect = submitted && optNorm === correctNorm
                        const isWrong = submitted && isSelected && optNorm !== correctNorm
                        return (
                          <button key={oi} disabled={submitted}
                            style={{ ...s.option, ...(isCorrect ? s.optCorrect : {}), ...(isWrong ? s.optWrong : {}), ...(isSelected && !submitted ? s.optSelected : {}) }}
                            onClick={() => !submitted && setAnswers(a => ({ ...a, [qi]: opt }))}>
                            {opt}
                          </button>
                        )
                      })}
                    </div>
                    {submitted && (
                      <div style={s.explanation}>
                        <strong>{isAnsweredCorrectly ? "✅ Correct!" : `❌ Correct answer: ${q.answer}`}</strong>
                        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#555" }}>{q.explanation}</p>
                      </div>
                    )}
                  </div>
                )})}

                {!submitted
                  ? <button style={s.primaryBtn} onClick={() => setSubmitted(true)}
                      disabled={Object.keys(answers).length < quiz.length}>
                      Submit Answers
                    </button>
                  : <div style={s.scoreCard}>
                      🎯 Score: {score} / {quiz.length} ({Math.round(score / quiz.length * 100)}%)
                      <button style={{ ...s.outlineBtn, marginLeft: 16 }}
                        onClick={() => { setQuiz([]); setAnswers({}); setSubmitted(false) }}>
                        Try Again
                      </button>
                    </div>
                }
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  root: { display: "flex", height: "100vh", fontFamily: "system-ui, sans-serif", background: "#f5f5f5" },
  sidebar: { width: 240, background: "#1a1a2e", color: "#eee", display: "flex", flexDirection: "column", padding: 16, gap: 12, flexShrink: 0 },
  logo: { fontSize: 20, fontWeight: 700, color: "#a78bfa", padding: "4px 0 12px" },
  dropzone: { border: "1.5px dashed #4a4a6a", borderRadius: 10, padding: "18px 12px", textAlign: "center", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, transition: "border-color 0.2s" },
  dropzoneActive: { borderColor: "#a78bfa", background: "#2a2a4a" },
  uploadHint: { fontSize: 12, color: "#aaa" },
  fileTag: { display: "flex", gap: 8, alignItems: "flex-start", background: "#2a2a40", borderRadius: 8, padding: "8px 10px", fontSize: 12 },
  nav: { display: "flex", flexDirection: "column", gap: 4, marginTop: 8 },
  navBtn: { background: "none", border: "none", color: "#bbb", padding: "10px 12px", borderRadius: 8, textAlign: "left", cursor: "pointer", fontSize: 14 },
  navBtnActive: { background: "#2d2d50", color: "#a78bfa", fontWeight: 600 },
  main: { flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" },
  empty: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  chatWrap: { flex: 1, display: "flex", flexDirection: "column", height: "100%" },
  messages: { flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 16 },
  bubble: { maxWidth: 680, padding: "12px 16px", borderRadius: 12, lineHeight: 1.5 },
  bubbleBot: { background: "#fff", border: "1px solid #e5e5e5", alignSelf: "flex-start" },
  bubbleUser: { background: "#a78bfa", color: "#fff", alignSelf: "flex-end" },
  bubbleRole: { display: "block", fontSize: 11, fontWeight: 700, opacity: 0.6, marginBottom: 4, textTransform: "uppercase" },
  inputRow: { display: "flex", gap: 8, padding: 16, borderTop: "1px solid #e5e5e5", background: "#fff" },
  input: { flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, outline: "none" },
  sendBtn: { padding: "10px 20px", background: "#a78bfa", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 },
  panel: { flex: 1, overflowY: "auto", padding: 32 },
  panelHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  panelTitle: { margin: 0, fontSize: 20, fontWeight: 700 },
  summaryBox: { background: "#fff", border: "1px solid #e5e5e5", borderRadius: 12, padding: 24, lineHeight: 1.8, whiteSpace: "pre-wrap", fontSize: 15 },
  placeholder: { color: "#999", textAlign: "center", marginTop: 60 },
  outlineBtn: { padding: "8px 16px", border: "1px solid #ccc", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 13 },
  primaryBtn: { padding: "10px 24px", background: "#a78bfa", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 },
  quizConfig: { display: "flex", gap: 16, alignItems: "flex-end", marginBottom: 24, flexWrap: "wrap" },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "#555" },
  select: { padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14 },
  questionCard: { background: "#fff", border: "1px solid #e5e5e5", borderRadius: 12, padding: 20, marginBottom: 16 },
  questionText: { fontWeight: 600, fontSize: 15, margin: "0 0 14px" },
  options: { display: "flex", flexDirection: "column", gap: 8 },
  option: { padding: "10px 16px", borderRadius: 8, border: "1px solid #ddd", background: "#fafafa", cursor: "pointer", textAlign: "left", fontSize: 14 },
  optSelected: { borderColor: "#a78bfa", background: "#f3f0ff" },
  optCorrect: { borderColor: "#22c55e", background: "#f0fdf4", color: "#15803d" },
  optWrong: { borderColor: "#ef4444", background: "#fef2f2", color: "#b91c1c" },
  explanation: { marginTop: 12, padding: 12, background: "#f9fafb", borderRadius: 8, borderLeft: "3px solid #a78bfa" },
  scoreCard: { background: "#f3f0ff", border: "1px solid #c4b5fd", borderRadius: 12, padding: 20, fontSize: 18, fontWeight: 700, color: "#5b21b6", marginTop: 8, display: "flex", alignItems: "center" },
}

export default App
