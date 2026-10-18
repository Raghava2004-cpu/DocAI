import { useEffect, useRef, useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/TextLayer.css"
import "react-pdf/dist/Page/AnnotationLayer.css"
import { ChevronLeft, ChevronRight, Minus, Plus, X, FileWarning } from "lucide-react"

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()

function useWidth(ref) {
  const [w, setW] = useState(480)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ref])
  return w
}

const METHOD_LABEL = {
  text: "Text page",
  vision: "Scan or handwriting, read by AI",
  ocr: "Scan, read by basic OCR",
  empty: "This page could not be read",
  blank: "Blank page",
}

export default function Viewer({ doc, page, flash, onPage, onClose }) {
  const bodyRef = useRef()
  const width = useWidth(bodyRef)
  const [zoom, setZoom] = useState(1)
  const [count, setCount] = useState(doc.pages?.length || 1)
  const [failed, setFailed] = useState(false)

  useEffect(() => { bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" }) }, [page])

  const isPdf = doc.kind === "pdf"
  const isImage = doc.kind === "image"
  const isTable = doc.type === "excel"
  const total = isPdf ? count : 1
  const method = doc.pages?.[page - 1]?.method

  return (
    <aside className="viewer" aria-label="Document viewer">
      <header className="viewer-bar">
        <div className="viewer-title" title={doc.name}>{doc.name}</div>
        {isPdf && (
          <div className="pager">
            <button className="icon-btn" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={16} /></button>
            <span className="pager-num">
              <input
                aria-label="Page number"
                value={page}
                onChange={e => { const n = Number(e.target.value); if (n >= 1 && n <= total) onPage(n) }}
              />
              <span>of {total}</span>
            </span>
            <button className="icon-btn" aria-label="Next page" disabled={page >= total} onClick={() => onPage(page + 1)}><ChevronRight size={16} /></button>
          </div>
        )}
        {!isTable && (
          <div className="zoom">
            <button className="icon-btn" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(0.6, +(z - 0.2).toFixed(1)))}><Minus size={15} /></button>
            <span>{Math.round(zoom * 100)}%</span>
            <button className="icon-btn" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(2.4, +(z + 0.2).toFixed(1)))}><Plus size={15} /></button>
          </div>
        )}
        <button className="icon-btn" aria-label="Close viewer" onClick={onClose}><X size={17} /></button>
      </header>

      {isPdf && method && method !== "text" && <div className={`page-note ${method}`}>{METHOD_LABEL[method]}</div>}

      <div className="viewer-body" ref={bodyRef}>
        {isPdf && !failed && (
          <Document
            file={doc.url}
            onLoadSuccess={({ numPages }) => setCount(numPages)}
            onLoadError={() => setFailed(true)}
            loading={<div className="sheet-skeleton" />}
          >
            <div key={flash} className={`page-wrap ${flash ? "flash" : ""}`}>
              <Page pageNumber={Math.min(page, total)} width={Math.max(240, (width - 32) * zoom)} loading={<div className="sheet-skeleton" />} />
            </div>
          </Document>
        )}
        {isPdf && failed && (
          <div className="viewer-empty"><FileWarning size={22} /><p>This PDF can’t be shown here, but you can still ask questions about it.</p></div>
        )}
        {isImage && (
          <div key={flash} className={`page-wrap ${flash ? "flash" : ""}`}>
            <img src={doc.url} alt={doc.name} style={{ width: `${zoom * 100}%` }} />
          </div>
        )}
        {isTable && doc.preview && <DataTable preview={doc.preview} />}
      </div>
    </aside>
  )
}

function DataTable({ preview }) {
  return (
    <div className="table-wrap">
      <p className="muted small">
        Showing {preview.rows.length} of {preview.total_rows.toLocaleString()} rows
      </p>
      <div className="table-scroll">
        <table>
          <thead><tr><th>#</th>{preview.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {preview.rows.map((r, i) => (
              <tr key={i}><td className="rownum">{i + 1}</td>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
