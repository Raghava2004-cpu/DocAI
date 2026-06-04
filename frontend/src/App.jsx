import { useState, useRef, useEffect } from "react"

const API = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || ""

if (!API) {
  console.warn("⚠️ VITE_API_URL is not set. Requests will fail. Set it in your deployment environment.")
}

function App() {
  const [session, setSession] = useState(null)
  const [tab, setTab] = useState("chat")
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
  const [error, setError] = useState("")
  const fileRef = useRef()
  const messagesEndRef = useRef()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  async function handleFile(file) {
    if (!file) return
    setError("")

    // Validate file type
    const ext = file.name.split(".").pop().toLowerCase()
    if (!["pdf", "xlsx", "xls", "csv"].includes(ext)) {
      setError("Only PDF, XLSX, XLS, and CSV files are supported.")
      return
    }

    setUploading(true)
    setSession(null); setMessages([]); setSummary(""); setQuiz([]); setAnswers({}); setSubmitted(false)
    const form = new FormData()
    form.append("file", file)

    try {
      const res = await fetch(`${API}/upload`, { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || "Upload failed")
      setSession(data)
      setMessages([{ role: "assistant", text: `✅ **${data.filename}** uploaded! Ask me anything about it.` }])
      setTab("chat")
    } catch (e) {
      if (e.message === "Failed to fetch") {
        setError("Cannot reach the server. Make sure VITE_API_URL is set to your Hugging Face backend URL.")
      } else {
        setError(e.message)
      }
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
      const res = await fetch(`${API}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: session.session_id, question: q })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || "Request failed")
      setMessages(m => [...m, { role: "assistant", text: data.answer }])
    } catch (e) {
      setMessages(m => [...m, { role: "assistant", text: `⚠️ Error: ${e.message}` }])
    } finally {
      setLoading(false)
    }
  }

  async function fetchSummary() {
    if (!session) return
    setLoading(true); setSummary("")
    try {
      const res = await fetch(`${API}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: session.session_id })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || "Request failed")
      setSummary(data.summary)
    } catch (e) {
      setSummary(`⚠️ Error: ${e.message}`)
    } finally {
      setLoading(false) }
  }

  async function fetchQuiz() {
    if (!session) return
    setLoading(true); setQuiz([]); setAnswers({}); setSubmitted(false)
    try {
      const res = await fetch(`${API}/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: session.session_id, num_questions: quizConfig.num, difficulty: quizConfig.difficulty })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || "Request failed")
      setQuiz(data.questions || [])
    } catch (e) {
      setError(`Quiz error: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const norm = (s) => (s || "").trim().toLowerCase()
  const score = quiz.filter((q, i) => norm(answers[i]) === norm(q.answer)).length

  const s = styles
  return (
    <div style={s.root}>
      {/* Sidebar */}
      <div style={s.sidebar}>
        <div style={s.logo}>📄 DocAI</div>

        {/* Error banner */}
        {error && (
          <div style={s.errorBanner}>
            ⚠️ {error}
            <button style={s.errorClose} onClick={() => setError("")}>✕</button>
          </div>
        )}

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
                onClick={() => { setTab(t); if (t === "summary" && !summary) fetchSummary() }}>
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
            {!API && (
              <div style={s.warnBox}>
                ⚠️ <strong>VITE_API_URL</strong> is not configured.<br />
                Set it to your Hugging Face backend URL before deploying.
              </div>
            )}
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
              {loading && (
                <div style={{ ...s.bubble, ...s.bubbleBot }}>
                  <span style={s.bubbleRole}>AI</span>
                  <p style={{ margin: 0, color: "#999" }}>Thinking…</p>
                </div>
              )}
              <div ref={messagesEndRef} />
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

            {quiz.length > 0 && (
              <div>
                {quiz.map((q, qi) => {
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
                  )
                })}

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
  root: { display: "flex", height: "100vh", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: "#fafbfc" },
  sidebar: { width: 260, background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", color: "#e2e8f0", display: "flex", flexDirection: "column", padding: 24, gap: 20, flexShrink: 0, boxShadow: "2px 0 12px rgba(0,0,0,0.1)", overflowY: "auto" },
  logo: { fontSize: 24, fontWeight: 800, background: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", padding: "8px 0 16px", letterSpacing: "-0.5px" },
  errorBanner: { background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 10, padding: "10px 14px", fontSize: 12, lineHeight: 1.5, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  errorClose: { background: "none", border: "none", color: "#b91c1c", cursor: "pointer", fontSize: 14, padding: 0, flexShrink: 0 },
  dropzone: { border: "2px dashed #475569", borderRadius: 14, padding: "28px 16px", textAlign: "center", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, transition: "all 0.3s ease", background: "rgba(100,116,139,0.05)" },
  dropzoneActive: { borderColor: "#06b6d4", background: "rgba(6,182,212,0.1)", transform: "scale(1.02)" },
  uploadHint: { fontSize: 13, color: "#cbd5e1", fontWeight: 500 },
  fileTag: { display: "flex", gap: 10, alignItems: "flex-start", background: "rgba(30,41,59,0.8)", borderRadius: 10, padding: "12px 14px", fontSize: 13, border: "1px solid rgba(148,163,184,0.2)" },
  nav: { display: "flex", flexDirection: "column", gap: 8, marginTop: 12 },
  navBtn: { background: "none", border: "none", color: "#94a3b8", padding: "12px 14px", borderRadius: 10, textAlign: "left", cursor: "pointer", fontSize: 15, fontWeight: 500, transition: "all 0.2s ease" },
  navBtnActive: { background: "linear-gradient(135deg, rgba(6,182,212,0.2) 0%, rgba(59,130,246,0.2) 100%)", color: "#06b6d4", fontWeight: 600, borderLeft: "3px solid #06b6d4", paddingLeft: 11 },
  main: { flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", background: "#fafbfc" },
  empty: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#64748b", padding: 32, textAlign: "center" },
  warnBox: { marginTop: 24, background: "#fffbeb", border: "1px solid #fcd34d", color: "#92400e", borderRadius: 10, padding: "14px 18px", fontSize: 13, lineHeight: 1.7 },
  chatWrap: { flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" },
  messages: { flex: 1, overflowY: "auto", padding: 32, display: "flex", flexDirection: "column", gap: 20 },
  bubble: { maxWidth: 700, padding: "14px 18px", borderRadius: 14, lineHeight: 1.6, fontSize: "15px" },
  bubbleBot: { background: "#fff", border: "1px solid #e2e8f0", alignSelf: "flex-start", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
  bubbleUser: { background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)", color: "#fff", alignSelf: "flex-end", boxShadow: "0 4px 12px rgba(6,182,212,0.3)" },
  bubbleRole: { display: "block", fontSize: 11, fontWeight: 700, opacity: 0.5, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" },
  inputRow: { display: "flex", gap: 12, padding: 20, borderTop: "1px solid #e2e8f0", background: "#fff", boxShadow: "0 -4px 12px rgba(0,0,0,0.04)" },
  input: { flex: 1, padding: "12px 16px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 15, outline: "none", background: "#f8fafc", transition: "all 0.2s ease" },
  sendBtn: { padding: "12px 24px", background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: 15, transition: "all 0.2s ease", boxShadow: "0 4px 12px rgba(6,182,212,0.3)" },
  panel: { flex: 1, overflowY: "auto", padding: 40 },
  panelHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 },
  panelTitle: { margin: 0, fontSize: 28, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.5px" },
  summaryBox: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 28, lineHeight: 1.8, whiteSpace: "pre-wrap", fontSize: 15, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", color: "#334155" },
  placeholder: { color: "#94a3b8", textAlign: "center", marginTop: 80, fontSize: 15 },
  outlineBtn: { padding: "10px 18px", border: "1.5px solid #e2e8f0", borderRadius: 10, background: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#475569", transition: "all 0.2s ease" },
  primaryBtn: { padding: "12px 28px", background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: 15, transition: "all 0.2s ease", boxShadow: "0 4px 12px rgba(6,182,212,0.3)" },
  quizConfig: { display: "flex", gap: 20, alignItems: "flex-end", marginBottom: 32, flexWrap: "wrap", background: "#f1f5f9", padding: 20, borderRadius: 12 },
  label: { display: "flex", flexDirection: "column", gap: 8, fontSize: 14, fontWeight: 600, color: "#334155" },
  select: { padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 15, background: "#fff", cursor: "pointer" },
  questionCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
  questionText: { fontWeight: 700, fontSize: 16, margin: "0 0 16px", color: "#0f172a" },
  options: { display: "flex", flexDirection: "column", gap: 10 },
  option: { padding: "12px 16px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", textAlign: "left", fontSize: 15, fontWeight: 500, transition: "all 0.2s ease", color: "#334155" },
  optSelected: { borderColor: "#06b6d4", background: "#ecfdf5", color: "#0f766e" },
  optCorrect: { borderColor: "#10b981", background: "#f0fdf4", color: "#065f46", fontWeight: 600 },
  optWrong: { borderColor: "#ef4444", background: "#fef2f2", color: "#7f1d1d", fontWeight: 600 },
  explanation: { marginTop: 16, padding: 16, background: "#f0f9ff", borderRadius: 10, borderLeft: "4px solid #06b6d4", fontSize: 14, color: "#334155" },
  scoreCard: { background: "linear-gradient(135deg, rgba(6,182,212,0.1) 0%, rgba(59,130,246,0.1) 100%)", border: "1.5px solid #cffafe", borderRadius: 12, padding: 24, fontSize: 20, fontWeight: 700, color: "#0f766e", marginTop: 12, display: "flex", alignItems: "center", boxShadow: "0 4px 12px rgba(6,182,212,0.15)" },
}

export default App
