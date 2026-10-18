import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react"
import {
  Plus, FileText, Image as ImageIcon, Sheet, Trash2, Loader2, PanelRightOpen, PanelRightClose,
  MessageSquare, ListChecks, ScrollText, Sun, Moon, Monitor, Menu, Download, UploadCloud,
  ScanText, Quote, Table2, AlertTriangle, X,
} from "lucide-react"
import { ApiError, getJSON, postJSON, streamAnswer, uploadFile } from "./lib/api"
import Chat from "./components/Chat"
import Summary from "./components/Summary"
import { download } from "./lib/download"
import Quiz from "./components/Quiz"
const Viewer = lazy(() => import("./components/Viewer"))

const DEFAULT_CONFIG = {
  max_file_mb: 25, max_pages: 150, max_vision_pages: 40, vision_enabled: true,
  accept: ["pdf", "png", "jpg", "jpeg", "webp", "xlsx", "xls", "csv"],
}
const KIND_BY_EXT = { pdf: "pdf", png: "image", jpg: "image", jpeg: "image", webp: "image", xlsx: "excel", xls: "excel", csv: "excel" }

const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d } catch { return d } },
  set(k, v) { try { localStorage.setItem(k, v) } catch { /* ignore */ } },
}

let uid = 0
const newId = () => `${Date.now().toString(36)}-${uid++}`

function DocIcon({ kind, size = 16 }) {
  if (kind === "image") return <ImageIcon size={size} />
  if (kind === "excel") return <Sheet size={size} />
  return <FileText size={size} />
}

// ------------------------------------------------------------------ app

export default function App() {
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [server, setServer] = useState("checking") // checking | waking | ok | down
  const [docs, setDocs] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [tab, setTab] = useState("chat")
  const [viewer, setViewer] = useState({ open: false, page: 1, flash: 0 })
  const [theme, setTheme] = useState(() => store.get("docai-theme", "system"))
  const [drawer, setDrawer] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [toast, setToast] = useState(null)
  const fileRef = useRef()
  const composerRef = useRef()
  const abortRef = useRef(null)
  const docsRef = useRef(docs)
  docsRef.current = docs

  const doc = docs.find(d => d.id === activeId) || null
  const busy = !!doc?.messages.some(m => m.streaming)

  // ---------------- theme
  useEffect(() => {
    const root = document.documentElement
    if (theme === "system") root.removeAttribute("data-theme")
    else root.setAttribute("data-theme", theme)
    store.set("docai-theme", theme)
  }, [theme])

  // ---------------- server status (free Hugging Face Spaces sleep and need time to wake up)
  useEffect(() => {
    let alive = true
    const slow = setTimeout(() => alive && setServer(s => (s === "checking" ? "waking" : s)), 2500)
    getJSON("/config", { timeout: 120000 })
      .then(c => { if (alive) { setConfig({ ...DEFAULT_CONFIG, ...c }); setServer("ok") } })
      .catch(() => alive && setServer("down"))
    return () => { alive = false; clearTimeout(slow) }
  }, [])

  const showToast = useCallback((text, tone = "error") => {
    setToast({ text, tone, id: Date.now() })
  }, [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  const patchDoc = useCallback((id, patch) => {
    setDocs(ds => ds.map(d => (d.id === id ? { ...d, ...(typeof patch === "function" ? patch(d) : patch) } : d)))
  }, [])

  // ---------------- upload
  async function startUpload(d) {
    patchDoc(d.id, { status: "uploading", progress: 0, error: "" })
    try {
      const data = await uploadFile(d.file, p => patchDoc(d.id, { progress: p, status: p >= 1 ? "reading" : "uploading" }))
      patchDoc(d.id, {
        status: "ready", session_id: data.session_id, type: data.type,
        pages: data.pages || [], warnings: data.warnings || [], preview: data.preview || null,
      })
      setServer("ok")
      loadSuggestions(d.id, data.session_id)
      return data.session_id
    } catch (e) {
      patchDoc(d.id, { status: "error", error: e.message })
      throw e
    }
  }

  function addFiles(fileList) {
    const files = Array.from(fileList || [])
    if (!files.length) return
    let firstId = null
    for (const file of files) {
      const ext = (file.name.split(".").pop() || "").toLowerCase()
      if (!config.accept.includes(ext)) {
        showToast(`“${file.name}” is not supported. Use PDF, PNG, JPG, WEBP, Excel or CSV.`)
        continue
      }
      if (file.size > config.max_file_mb * 1024 * 1024) {
        showToast(`“${file.name}” is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${config.max_file_mb} MB.`)
        continue
      }
      const d = {
        id: newId(), file, name: file.name, kind: KIND_BY_EXT[ext], type: KIND_BY_EXT[ext] === "excel" ? "excel" : "pdf",
        url: URL.createObjectURL(file), status: "uploading", progress: 0,
        messages: [], suggestions: null, summary: null, quiz: null, pages: [], warnings: [],
      }
      setDocs(ds => [d, ...ds])
      firstId ??= d.id
      startUpload(d).catch(() => {})
    }
    if (firstId) {
      setActiveId(firstId)
      setTab("chat")
      setViewer({ open: false, page: 1, flash: 0 })
      setDrawer(false)
    }
  }

  function removeDoc(id) {
    const d = docs.find(x => x.id === id)
    if (d?.url) URL.revokeObjectURL(d.url)
    const rest = docs.filter(x => x.id !== id)
    setDocs(rest)
    if (activeId === id) setActiveId(rest[0]?.id || null)
  }

  // Free servers restart and forget files. If the server says "session not found", upload again quietly and retry once.
  async function withSession(id, fn) {
    const d = docsRef.current.find(x => x.id === id)
    try {
      return await fn(d.session_id)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        showToast("The server restarted. Reading your file again…", "info")
        const sid = await startUpload(d)
        return fn(sid)
      }
      throw e
    }
  }

  async function loadSuggestions(id, sid) {
    try {
      const data = await postJSON("/suggest", { session_id: sid })
      patchDoc(id, { suggestions: data.questions || [] })
    } catch {
      patchDoc(id, { suggestions: [] })
    }
  }

  // ---------------- ask (streaming, with fallback to the normal endpoint)
  async function ask(question, base) {
    if (!doc || doc.status !== "ready") return
    const id = doc.id
    const prior = (base || doc.messages).filter(m => !m.streaming && !m.error && m.text)
    const history = prior.slice(-6).map(m => ({ role: m.role, text: m.text }))
    const aid = newId()
    patchDoc(id, d => ({
      messages: [...(base || d.messages), { id: newId(), role: "user", text: question }, { id: aid, role: "assistant", text: "", streaming: true }],
    }))
    const setMsg = fn => patchDoc(id, d => ({ messages: d.messages.map(m => (m.id === aid ? { ...m, ...fn(m) } : m)) }))

    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const result = await withSession(id, sid =>
        streamAnswer({ session_id: sid, question, history }, {
          signal: ctrl.signal,
          onToken: t => setMsg(m => ({ text: m.text + t })),
        }).catch(async e => {
          // Streaming blocked or broke before any text: use the normal endpoint instead
          if (ctrl.signal.aborted || e.partial || e.status === 404 || e.status === 400) throw e
          setMsg(() => ({ text: "" }))
          return postJSON("/ask", { session_id: sid, question, history })
        })
      )
      setMsg(() => ({ text: result.answer, sources: result.sources || [], snippets: result.snippets || {}, streaming: false }))
      if (result.sources?.length && viewer.open) jumpTo(result.sources[0], false)
    } catch (e) {
      if (ctrl.signal.aborted) setMsg(() => ({ streaming: false, stopped: true }))
      else setMsg(m => ({ streaming: false, error: m.text ? `${e.message}` : e.message }))
    } finally {
      abortRef.current = null
    }
  }

  function regenerate() {
    const msgs = doc.messages
    const lastUser = [...msgs].reverse().find(m => m.role === "user")
    if (!lastUser) return
    const cut = msgs.slice(0, msgs.lastIndexOf(lastUser))
    ask(lastUser.text, cut)
  }

  // ---------------- summary + quiz
  async function loadSummary() {
    const id = doc.id
    patchDoc(id, { summary: { loading: true } })
    try {
      const data = await withSession(id, sid => postJSON("/summarize", { session_id: sid }))
      patchDoc(id, { summary: { text: data.summary } })
    } catch (e) {
      patchDoc(id, { summary: { error: e.message } })
    }
  }

  async function createQuiz(num, difficulty) {
    const id = doc.id
    patchDoc(id, { quiz: { items: [], loading: true } })
    try {
      const data = await withSession(id, sid => postJSON("/quiz", { session_id: sid, num_questions: num, difficulty }))
      patchDoc(id, { quiz: { items: data.questions || [], answers: {}, index: 0 } })
    } catch (e) {
      patchDoc(id, { quiz: { items: [], error: e.message } })
    }
  }

  // ---------------- viewer
  function jumpTo(page, open = true) {
    if (!doc || doc.type === "excel") return
    setViewer(v => ({ open: open || v.open, page, flash: v.flash + 1 }))
  }

  function openTab(t) {
    setTab(t)
    if (t === "summary" && doc && !doc.summary) loadSummary()
  }

  function exportChat() {
    const md = doc.messages
      .filter(m => m.text)
      .map(m => (m.role === "user" ? `### ${m.text}\n` : `${m.text}\n`))
      .join("\n")
    download(`${doc.name.replace(/\.[^.]+$/, "")}-chat.md`, `# Chat about ${doc.name}\n\n${md}`)
  }

  // ---------------- global drag & drop, paste images, "/" to focus
  useEffect(() => {
    let depth = 0
    const enter = e => { if (e.dataTransfer?.types?.includes("Files")) { depth++; setDragging(true) } }
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) setDragging(false) }
    const over = e => e.preventDefault()
    const drop = e => { e.preventDefault(); depth = 0; setDragging(false); addFiles(e.dataTransfer.files) }
    const paste = e => {
      const files = Array.from(e.clipboardData?.files || [])
      if (files.length) {
        e.preventDefault()
        addFiles(files.map((f, i) => (f.name === "image.png" ? new File([f], `pasted-${Date.now()}-${i}.png`, { type: f.type }) : f)))
      }
    }
    const key = e => {
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
        e.preventDefault(); composerRef.current?.focus()
      }
    }
    window.addEventListener("dragenter", enter)
    window.addEventListener("dragleave", leave)
    window.addEventListener("dragover", over)
    window.addEventListener("drop", drop)
    window.addEventListener("paste", paste)
    window.addEventListener("keydown", key)
    return () => {
      window.removeEventListener("dragenter", enter)
      window.removeEventListener("dragleave", leave)
      window.removeEventListener("dragover", over)
      window.removeEventListener("drop", drop)
      window.removeEventListener("paste", paste)
      window.removeEventListener("keydown", key)
    }
  })

  const accept = config.accept.map(a => "." + a).join(",")
  const canView = doc && doc.status === "ready"

  return (
    <div className={`shell ${viewer.open && canView ? "with-viewer" : ""}`}>
      <input ref={fileRef} type="file" hidden multiple accept={accept} onChange={e => { addFiles(e.target.files); e.target.value = "" }} />

      {/* ------------------------------------------------ sidebar */}
      <aside className={`sidebar ${drawer ? "open" : ""}`}>
        <div className="side-top">
          <div className="logo"><span className="logo-mark"><Quote size={13} strokeWidth={2.6} /></span>DocAI</div>
          <button className="icon-btn only-mobile" aria-label="Close menu" onClick={() => setDrawer(false)}><X size={18} /></button>
        </div>
        <button className="btn new" onClick={() => fileRef.current.click()}><Plus size={16} />New file</button>

        <div className="side-label">Your files</div>
        <nav className="doc-list">
          {docs.length === 0 && <p className="muted small side-empty">Files you upload show up here.</p>}
          {docs.map(d => (
            <div key={d.id} className={`doc-item ${d.id === activeId ? "on" : ""}`}>
              <button className="doc-main" onClick={() => { setActiveId(d.id); setDrawer(false); setViewer(v => ({ ...v, page: 1 })) }}>
                <span className={`doc-ico ${d.kind}`}><DocIcon kind={d.kind} size={15} /></span>
                <span className="doc-text">
                  <span className="doc-name">{d.name}</span>
                  <span className="doc-meta">
                    {d.status === "uploading" && `Uploading ${Math.round((d.progress || 0) * 100)}%`}
                    {d.status === "reading" && "Reading pages…"}
                    {d.status === "error" && "Failed"}
                    {d.status === "ready" && (d.type === "excel"
                      ? `${d.preview?.total_rows?.toLocaleString() ?? ""} rows`
                      : `${d.pages.length} ${d.pages.length === 1 ? "page" : "pages"}`)}
                  </span>
                </span>
                {(d.status === "uploading" || d.status === "reading") && <Loader2 size={14} className="spin muted" />}
              </button>
              <button className="icon-btn doc-del" aria-label={`Remove ${d.name}`} onClick={() => removeDoc(d.id)}><Trash2 size={14} /></button>
            </div>
          ))}
        </nav>

        <div className="side-foot">
          <div className={`status ${server}`}>
            <span className="dot" />
            {server === "ok" && "Server ready"}
            {server === "checking" && "Connecting…"}
            {server === "waking" && "Server is waking up (up to a minute)"}
            {server === "down" && "Server not reachable"}
          </div>
          <div className="theme-switch" role="radiogroup" aria-label="Theme">
            {[["light", Sun], ["system", Monitor], ["dark", Moon]].map(([t, Icon]) => (
              <button key={t} role="radio" aria-checked={theme === t} aria-label={`${t} theme`} className={theme === t ? "on" : ""} onClick={() => setTheme(t)}>
                <Icon size={14} />
              </button>
            ))}
          </div>
        </div>
      </aside>
      {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}

      {/* ------------------------------------------------ main */}
      <main className="main">
        <header className="topbar">
          <button className="icon-btn only-mobile" aria-label="Open menu" onClick={() => setDrawer(true)}><Menu size={18} /></button>
          {doc ? (
            <>
              <div className="top-title">
                <span className={`doc-ico ${doc.kind}`}><DocIcon kind={doc.kind} size={14} /></span>
                <span className="truncate">{doc.name}</span>
              </div>
              {doc.status === "ready" && (
                <nav className="tabs" role="tablist">
                  {[["chat", "Chat", MessageSquare], ["summary", "Summary", ScrollText], ["quiz", "Quiz", ListChecks]].map(([k, l, Icon]) => (
                    <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => openTab(k)}>
                      <Icon size={15} /><span>{l}</span>
                    </button>
                  ))}
                </nav>
              )}
              <div className="top-actions">
                {tab === "chat" && doc.messages.some(m => m.text) && (
                  <button className="icon-btn" aria-label="Download chat" title="Download chat" onClick={exportChat}><Download size={17} /></button>
                )}
                {canView && (
                  <button className="icon-btn" aria-label={viewer.open ? "Hide document" : "Show document"} title={viewer.open ? "Hide document" : "Show document"}
                    onClick={() => setViewer(v => ({ ...v, open: !v.open }))}>
                    {viewer.open ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
                  </button>
                )}
              </div>
            </>
          ) : <div className="top-title"><span className="logo only-mobile">DocAI</span></div>}
        </header>

        {!doc && <Welcome config={config} onPick={() => fileRef.current.click()} />}

        {doc && doc.status !== "ready" && <Processing doc={doc} onRetry={() => startUpload(doc).catch(() => {})} onRemove={() => removeDoc(doc.id)} />}

        {doc && doc.status === "ready" && (
          <>
            {doc.warnings?.length > 0 && !doc.warningsHidden && (
              <div className="banner">
                <AlertTriangle size={15} />
                <span>{doc.warnings.join(" ")}</span>
                <button className="icon-btn" aria-label="Dismiss" onClick={() => patchDoc(doc.id, { warningsHidden: true })}><X size={14} /></button>
              </div>
            )}
            {tab === "chat" && (
              <Chat doc={doc} busy={busy} onAsk={q => ask(q)} onStop={() => abortRef.current?.abort()} onRegenerate={regenerate} onCite={p => jumpTo(p)} composerRef={composerRef} />
            )}
            {tab === "summary" && <Summary doc={doc} onRefresh={loadSummary} onCite={p => jumpTo(p)} />}
            {tab === "quiz" && <Quiz doc={doc} onCreate={createQuiz} onUpdate={quiz => patchDoc(doc.id, { quiz })} onCite={p => jumpTo(p)} />}
          </>
        )}
      </main>

      {viewer.open && canView && (
        <Suspense fallback={<aside className="viewer"><div className="viewer-body"><div className="sheet-skeleton" /></div></aside>}>
          <Viewer key={doc.id} doc={doc} page={viewer.page} flash={viewer.flash} onPage={p => setViewer(v => ({ ...v, page: p }))} onClose={() => setViewer(v => ({ ...v, open: false }))} />
        </Suspense>
      )}

      {dragging && (
        <div className="drop-overlay"><div><UploadCloud size={30} /><p>Drop to upload</p><span>PDF, images, Excel or CSV</span></div></div>
      )}
      {toast && <div key={toast.id} className={`toast ${toast.tone}`} role="status">{toast.text}</div>}
    </div>
  )
}

// ------------------------------------------------------------------ screens

function Welcome({ config, onPick }) {
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <h1>Chat with any document.<br /><span className="soft">Even handwritten notes.</span></h1>
        <p className="lead">Upload a PDF, a photo of your notes, or a spreadsheet. Ask questions and get answers that link to the exact page.</p>

        <button className="dropzone" onClick={onPick}>
          <UploadCloud size={26} />
          <strong>Choose files or drop them anywhere</strong>
          <span>PDF, PNG, JPG, WEBP, Excel, CSV. Up to {config.max_file_mb} MB and {config.max_pages} pages. You can also paste a screenshot.</span>
        </button>

        <div className="features">
          <div><ScanText size={18} /><strong>Reads scans and handwriting</strong><span>AI vision reads every page, not just typed text.</span></div>
          <div><Quote size={18} /><strong>Answers with page links</strong><span>Click a citation to open that page next to the chat.</span></div>
          <div><ListChecks size={18} /><strong>Summaries and quizzes</strong><span>Revise faster before exams.</span></div>
          <div><Table2 size={18} /><strong>Spreadsheets too</strong><span>Ask questions about rows and columns.</span></div>
        </div>
      </div>
    </div>
  )
}

function Processing({ doc, onRetry, onRemove }) {
  if (doc.status === "error") {
    return (
      <div className="processing">
        <div className="proc-card">
          <AlertTriangle size={22} className="bad" />
          <h2>Could not read this file</h2>
          <p className="muted">{doc.error}</p>
          <div className="row center">
            <button className="btn" onClick={onRemove}><Trash2 size={15} />Remove</button>
            <button className="btn primary" onClick={onRetry}>Try again</button>
          </div>
        </div>
      </div>
    )
  }
  const reading = doc.status === "reading"
  return (
    <div className="processing">
      <div className="proc-card">
        <Loader2 size={22} className="spin" />
        <h2>{reading ? "Reading your file" : "Uploading"}</h2>
        <p className="muted">{reading ? "Scanned and handwritten pages take a little longer. This usually takes under a minute." : `${Math.round((doc.progress || 0) * 100)}% sent`}</p>
        <div className="track wide"><div className={reading ? "indeterminate" : ""} style={{ width: reading ? "40%" : `${Math.round((doc.progress || 0) * 100)}%` }} /></div>
      </div>
    </div>
  )
}

