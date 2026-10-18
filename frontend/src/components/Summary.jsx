import { useState } from "react"
import { Copy, Check, Download, RefreshCw, AlertCircle } from "lucide-react"
import Markdown from "./Markdown"
import { download } from "../lib/download"

export default function Summary({ doc, onRefresh, onCite }) {
  const s = doc.summary || {}
  const [copied, setCopied] = useState(false)
  const base = doc.name.replace(/\.[^.]+$/, "")

  return (
    <div className="pane-scroll">
      <div className="pane">
        <header className="pane-head">
          <div>
            <h1>Summary</h1>
            <p className="muted">Key ideas from the whole file, with page links.</p>
          </div>
          <div className="row">
            {s.text && (
              <>
                <button className="btn" onClick={async () => { await navigator.clipboard.writeText(s.text); setCopied(true); setTimeout(() => setCopied(false), 1400) }}>
                  {copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy"}
                </button>
                <button className="btn" onClick={() => download(`${base}-summary.md`, s.text)}><Download size={15} />Download</button>
              </>
            )}
            <button className="btn" onClick={onRefresh} disabled={s.loading}><RefreshCw size={15} className={s.loading ? "spin" : ""} />{s.text ? "Write again" : "Write summary"}</button>
          </div>
        </header>

        {s.loading && <div className="skeleton">{[92, 100, 84, 96, 70, 88].map((w, i) => <span key={i} style={{ width: `${w}%` }} />)}</div>}
        {s.error && <div className="msg-error"><AlertCircle size={15} /><span>{s.error}</span></div>}
        {s.text && <article className="summary-card"><Markdown onCite={onCite}>{s.text}</Markdown></article>}
      </div>
    </div>
  )
}
