import { useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

const API = import.meta.env.VITE_API_URL || "http://localhost:8000"

const DEFAULT_CONFIG = {
  max_file_mb: 25,
  max_pages: 150,
  max_vision_pages: 40,
  vision_enabled: true,
  accept: ["pdf", "png", "jpg", "jpeg", "webp", "xlsx", "xls", "csv"],
}

const PAGE_KINDS = {
  text: "Text",
  vision: "Scan or handwriting, read by AI",
  ocr: "Scan, read by basic OCR",
  empty: "Could not read",
  blank: "Blank page",
}

const PDF_PROMPTS = [
  "What is this document about?",
  "List the key formulas and what each one means",
  "Explain the hardest idea here in simple words",
]
const DATA_PROMPTS = [
  "What does this data contain?",
  "Which columns have missing values?",
  "What patterns stand out?",
]

// ------------------------------------------------------------ helpers

async function api(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  return parse(res.status, await res.text())
}

function parse(status, text) {
  let data = null
  try { data = JSON.parse(text) } catch { /* not JSON */ }
  if (status < 200 || status >= 300) {
    throw new Error(data?.detail || `Server error ${status}. Please try again.`)
  }
  if (!data) throw new Error("The server sent an unexpected reply. Please try again.")
  return data
}

function uploadWithProgress(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", `${API}/upload`)
    xhr.upload.onprogress = e => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.upload.onload = () => onProgress(1)
    xhr.onload = () => {
      try { resolve(parse(xhr.status, xhr.responseText)) } catch (e) { reject(e) }
    }
    xhr.onerror = () => reject(new Error("Could not reach the server. Check your connection and try again."))
    const form = new FormData()
    form.append("file", file)
    xhr.send(form)
  })
}

function Markdown({ children }) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: props => <a {...props} target="_blank" rel="noreferrer" /> }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

function CopyButton({ text }) {
  const [done, setDone] = useState(false)
  return (
    <button
      className="ghost small"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) } catch { /* ignore */ }
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  )
}

function formatMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(1)
}

// ------------------------------------------------------------ app

export default function App() {
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [doc, setDoc] = useState(null)
  const [upload, setUpload] = useState(null) // {name, progress, stage}
  const [uploadError, setUploadError] = useState("")
  const [tab, setTab] = useState("ask")
  const [highlight, setHighlight] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()

  // per-document state
  const [messages, setMessages] = useState([])
  const [summary, setSummary] = useState({ text: "", loading: false, error: "" })
  const [quiz, setQuiz] = useState({ items: [], loading: false, error: "", answers: {}, submitted: false })

  useEffect(() => {
    api("/config").then(c => setConfig({ ...DEFAULT_CONFIG, ...c })).catch(() => {})
  }, [])

  async function handleFile(file) {
    if (!file || upload) return
    setUploadError("")
    const ext = file.name.split(".").pop().toLowerCase()
    if (!config.accept.includes(ext)) {
      setUploadError(`“.${ext}” files are not supported. Upload a PDF, an image, or an Excel/CSV file.`)
      return
    }
    if (file.size > config.max_file_mb * 1024 * 1024) {
      setUploadError(`This file is ${formatMB(file.size)} MB. The limit is ${config.max_file_mb} MB. Compress or split it first.`)
      return
    }
    setUpload({ name: file.name, progress: 0, stage: "upload" })
    try {
      const data = await uploadWithProgress(file, p =>
        setUpload(u => u && { ...u, progress: p, stage: p >= 1 ? "read" : "upload" })
      )
      setDoc(data)
      setMessages([])
      setSummary({ text: "", loading: false, error: "" })
      setQuiz({ items: [], loading: false, error: "", answers: {}, submitted: false })
      setHighlight([])
      setTab("ask")
    } catch (e) {
      setUploadError(e.message)
    } finally {
      setUpload(null)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function ask(question) {
    const q = question.trim()
    if (!q || !doc) return
    const id = Date.now()
    setMessages(m => [...m, { id, role: "user", text: q }, { id: id + 1, role: "assistant", pending: true }])
    try {
      const data = await api("/ask", { session_id: doc.session_id, question: q })
      setMessages(m => m.map(x => x.id === id + 1 ? { ...x, pending: false, text: data.answer, sources: data.sources || [] } : x))
      setHighlight(data.sources || [])
    } catch (e) {
      setMessages(m => m.map(x => x.id === id + 1 ? { ...x, pending: false, error: e.message, retry: q } : x))
    }
  }

  async function loadSummary() {
    if (!doc) return
    setSummary({ text: "", loading: true, error: "" })
    try {
      const data = await api("/summarize", { session_id: doc.session_id })
      setSummary({ text: data.summary, loading: false, error: "" })
    } catch (e) {
      setSummary({ text: "", loading: false, error: e.message })
    }
  }

  async function loadQuiz(num, difficulty) {
    setQuiz({ items: [], loading: true, error: "", answers: {}, submitted: false })
    try {
      const data = await api("/quiz", { session_id: doc.session_id, num_questions: num, difficulty })
      setQuiz({ items: data.questions || [], loading: false, error: "", answers: {}, submitted: false })
    } catch (e) {
      setQuiz(q => ({ ...q, loading: false, error: e.message }))
    }
  }

  function openTab(t) {
    setTab(t)
    if (t === "summary" && !summary.text && !summary.loading) loadSummary()
  }

  const isPdf = doc?.type === "pdf"

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          DocAI
        </div>

        <div
          className={`drop ${dragOver ? "over" : ""} ${upload ? "busy" : ""}`}
          role="button"
          tabIndex={0}
          aria-label="Upload a file"
          onClick={() => !upload && fileRef.current.click()}
          onKeyDown={e => (e.key === "Enter" || e.key === " ") && !upload && fileRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
        >
          <input
            ref={fileRef}
            type="file"
            hidden
            accept={config.accept.map(a => "." + a).join(",")}
            onChange={e => handleFile(e.target.files[0])}
          />
          {upload ? (
            <UploadProgress upload={upload} />
          ) : (
            <>
              <strong>{doc ? "Upload another file" : "Upload a file"}</strong>
              <span>Drop it here or click to choose</span>
              <span className="limits">
                PDF, scans, handwritten notes, images, Excel or CSV. Up to {config.max_file_mb} MB and {config.max_pages} pages.
              </span>
            </>
          )}
        </div>
        {uploadError && <p className="error" role="alert">{uploadError}</p>}

        {doc && (
          <section className="docinfo">
            <h2 className="docname" title={doc.filename}>{doc.filename}</h2>
            {isPdf ? <PageRail pages={doc.pages} highlight={highlight} /> : <p className="muted">Spreadsheet</p>}
            {doc.warnings?.length > 0 && (
              <ul className="notes">
                {doc.warnings.map(w => <li key={w}>{w}</li>)}
              </ul>
            )}
          </section>
        )}
      </aside>

      <main className="main">
        {!doc ? (
          <Welcome config={config} />
        ) : (
          <>
            <nav className="tabs" role="tablist">
              {[["ask", "Ask"], ["summary", "Summary"], ["quiz", "Quiz"]].map(([key, label]) => (
                <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "on" : ""} onClick={() => openTab(key)}>
                  {label}
                </button>
              ))}
            </nav>

            {tab === "ask" && (
              <Chat
                messages={messages}
                prompts={isPdf ? PDF_PROMPTS : DATA_PROMPTS}
                onAsk={ask}
                onSources={setHighlight}
              />
            )}
            {tab === "summary" && <Summary state={summary} onRefresh={loadSummary} />}
            {tab === "quiz" && <Quiz state={quiz} setState={setQuiz} onCreate={loadQuiz} />}
          </>
        )}
      </main>
    </div>
  )
}

// ------------------------------------------------------------ pieces

function UploadProgress({ upload }) {
  const reading = upload.stage === "read"
  return (
    <div className="progress" aria-live="polite">
      <strong className="truncate">{upload.name}</strong>
      <div className="bar"><div style={{ width: `${reading ? 100 : Math.round(upload.progress * 100)}%` }} className={reading ? "pulse" : ""} /></div>
      <span>{reading ? "Reading pages. Scanned pages take a little longer." : `Uploading ${Math.round(upload.progress * 100)}%`}</span>
    </div>
  )
}

function PageRail({ pages, highlight }) {
  const counts = pages.reduce((acc, p) => ({ ...acc, [p.method]: (acc[p.method] || 0) + 1 }), {})
  const hl = new Set(highlight)
  return (
    <div className="rail">
      <p className="muted">
        {pages.length} {pages.length === 1 ? "page" : "pages"}
        {counts.vision ? `, ${counts.vision} read from scans by AI` : ""}
      </p>
      <div className="sheets" aria-label="Pages">
        {pages.map(p => (
          <span
            key={p.page}
            className={`sheet ${p.method} ${hl.has(p.page) ? "cited" : ""}`}
            title={`Page ${p.page}: ${PAGE_KINDS[p.method]}${hl.has(p.page) ? " (used in the last answer)" : ""}`}
          >
            {pages.length <= 60 ? p.page : ""}
          </span>
        ))}
      </div>
      <ul className="legend">
        {Object.keys(PAGE_KINDS).filter(k => counts[k]).map(k => (
          <li key={k}><span className={`sheet mini ${k}`} />{PAGE_KINDS[k]}</li>
        ))}
        {highlight.length > 0 && <li><span className="sheet mini cited" />Used in the answer</li>}
      </ul>
    </div>
  )
}

function Welcome({ config }) {
  return (
    <div className="welcome">
      <h1>Ask your notes anything.</h1>
      <p>
        Upload a PDF, a photo of handwritten notes, or a spreadsheet. DocAI reads every page, answers your
        questions with the page numbers it used, writes a summary, and makes a quiz to test you.
      </p>
      <dl className="facts">
        <div><dt>Scans and handwriting</dt><dd>Read by AI vision{config.vision_enabled ? "" : " (basic OCR on this server)"}</dd></div>
        <div><dt>File size</dt><dd>Up to {config.max_file_mb} MB</dd></div>
        <div><dt>Length</dt><dd>Up to {config.max_pages} pages</dd></div>
      </dl>
    </div>
  )
}

function Chat({ messages, prompts, onAsk, onSources }) {
  const [input, setInput] = useState("")
  const endRef = useRef()
  const busy = messages.some(m => m.pending)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }) }, [messages])

  function send(text) {
    if (busy || !text.trim()) return
    onAsk(text)
    setInput("")
  }

  return (
    <div className="chat">
      <div className="thread">
        {messages.length === 0 && (
          <div className="starters">
            <p className="muted">Try one of these, or type your own question below.</p>
            {prompts.map(p => <button key={p} className="starter" onClick={() => send(p)}>{p}</button>)}
          </div>
        )}
        {messages.map(m =>
          m.role === "user" ? (
            <p key={m.id} className="q">{m.text}</p>
          ) : (
            <article key={m.id} className="a">
              {m.pending && <span className="dots" aria-label="Writing the answer"><i /><i /><i /></span>}
              {m.error && (
                <p className="error">
                  {m.error} <button className="link" onClick={() => onAsk(m.retry)}>Ask again</button>
                </p>
              )}
              {m.text && <Markdown>{m.text}</Markdown>}
              {m.text && (
                <footer className="afoot">
                  {m.sources?.length > 0 && (
                    <button className="sources" onClick={() => onSources(m.sources)} title="Show these pages in the page map">
                      From {m.sources.length === 1 ? "page" : "pages"} {m.sources.join(", ")}
                    </button>
                  )}
                  <CopyButton text={m.text} />
                </footer>
              )}
            </article>
          )
        )}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={e => { e.preventDefault(); send(input) }}>
        <textarea
          rows={1}
          value={input}
          placeholder="Ask a question about this file"
          aria-label="Your question"
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input) } }}
        />
        <button className="primary" disabled={busy || !input.trim()}>Ask</button>
      </form>
    </div>
  )
}

function Summary({ state, onRefresh }) {
  return (
    <div className="panel">
      <header className="panel-head">
        <h1>Summary</h1>
        <div className="row">
          {state.text && <CopyButton text={state.text} />}
          <button className="ghost" onClick={onRefresh} disabled={state.loading}>
            {state.loading ? "Writing…" : "Write again"}
          </button>
        </div>
      </header>
      {state.loading && <Skeleton />}
      {state.error && <p className="error">{state.error}</p>}
      {state.text && <Markdown>{state.text}</Markdown>}
    </div>
  )
}

function Skeleton() {
  return <div className="skeleton" aria-label="Loading">{[90, 100, 75, 95, 60].map((w, i) => <span key={i} style={{ width: `${w}%` }} />)}</div>
}

function Quiz({ state, setState, onCreate }) {
  const [num, setNum] = useState(5)
  const [difficulty, setDifficulty] = useState("medium")
  const { items, answers, submitted } = state
  const score = items.filter((q, i) => answers[i] === q.answer).length
  const answered = Object.keys(answers).length

  const pick = (qi, opt) => !submitted && setState(s => ({ ...s, answers: { ...s.answers, [qi]: opt } }))

  return (
    <div className="panel">
      <header className="panel-head">
        <h1>Quiz</h1>
        {items.length > 0 && !submitted && <span className="muted">{answered} of {items.length} answered</span>}
      </header>

      {items.length === 0 && (
        <div className="quiz-setup">
          <label>Questions
            <select value={num} onChange={e => setNum(+e.target.value)}>
              {[3, 5, 7, 10].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label>Difficulty
            <select value={difficulty} onChange={e => setDifficulty(e.target.value)}>
              {["easy", "medium", "hard"].map(d => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}
            </select>
          </label>
          <button className="primary" onClick={() => onCreate(num, difficulty)} disabled={state.loading}>
            {state.loading ? "Making the quiz…" : "Make quiz"}
          </button>
        </div>
      )}
      {state.loading && <Skeleton />}
      {state.error && <p className="error">{state.error}</p>}

      {items.length > 0 && (
        <ol className="questions">
          {items.map((q, qi) => {
            const chosen = answers[qi]
            return (
              <li key={qi} className="question">
                <p className="qtext">{q.question}</p>
                <div className="options" role="radiogroup">
                  {q.options.map(opt => {
                    let cls = "option"
                    if (!submitted && chosen === opt) cls += " chosen"
                    if (submitted && opt === q.answer) cls += " right"
                    if (submitted && chosen === opt && opt !== q.answer) cls += " wrong"
                    return (
                      <button key={opt} role="radio" aria-checked={chosen === opt} className={cls} disabled={submitted} onClick={() => pick(qi, opt)}>
                        {opt}
                      </button>
                    )
                  })}
                </div>
                {submitted && (
                  <p className="why">
                    <strong>{chosen === q.answer ? "Correct." : `Answer: ${q.answer}.`}</strong> {q.explanation}
                    {q.page ? <span className="muted"> See page {q.page}.</span> : null}
                  </p>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {items.length > 0 && (
        !submitted ? (
          <button className="primary" disabled={answered < items.length} onClick={() => setState(s => ({ ...s, submitted: true }))}>
            Check answers
          </button>
        ) : (
          <div className="score">
            <p><span className="big">{score}/{items.length}</span> correct</p>
            <div className="row">
              <button className="ghost" onClick={() => setState(s => ({ ...s, answers: {}, submitted: false }))}>Try the same quiz</button>
              <button className="primary" onClick={() => setState({ items: [], loading: false, error: "", answers: {}, submitted: false })}>New quiz</button>
            </div>
          </div>
        )
      )}
    </div>
  )
}
