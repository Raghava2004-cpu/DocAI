import { useState } from "react"
import { Check, X, ArrowRight, RotateCcw, Sparkles, AlertCircle } from "lucide-react"
import Markdown from "./Markdown"

const COUNTS = [5, 10]
const LEVELS = [["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]]

export default function Quiz({ doc, onCreate, onUpdate, onCite }) {
  const q = doc.quiz || { items: [] }
  const [num, setNum] = useState(5)
  const [level, setLevel] = useState("medium")

  const items = q.items || []
  const answers = q.answers || {}
  const index = q.index || 0
  const finished = items.length > 0 && index >= items.length
  const set = patch => onUpdate({ ...q, ...patch })

  if (!items.length) {
    return (
      <div className="pane-scroll">
        <div className="pane narrow">
          <header className="pane-head">
            <div>
              <h1>Quiz</h1>
              <p className="muted">Test yourself on this file. You see the right answer after each question.</p>
            </div>
          </header>
          <div className="setup">
            <div className="field">
              <span className="field-label">Number of questions</span>
              <div className="seg">
                {COUNTS.map(n => <button key={n} className={num === n ? "on" : ""} onClick={() => setNum(n)}>{n}</button>)}
              </div>
            </div>
            <div className="field">
              <span className="field-label">Difficulty</span>
              <div className="seg">
                {LEVELS.map(([v, l]) => <button key={v} className={level === v ? "on" : ""} onClick={() => setLevel(v)}>{l}</button>)}
              </div>
            </div>
            <button className="btn primary big" onClick={() => onCreate(num, level)} disabled={q.loading}>
              <Sparkles size={16} className={q.loading ? "spin" : ""} />
              {q.loading ? "Making your quiz…" : "Start quiz"}
            </button>
            {q.error && <div className="msg-error"><AlertCircle size={15} /><span>{q.error}</span></div>}
          </div>
        </div>
      </div>
    )
  }

  if (finished) {
    const score = items.filter((it, i) => answers[i] === it.answer).length
    const pct = Math.round((score / items.length) * 100)
    const wrong = items.map((it, i) => ({ ...it, i, chosen: answers[i] })).filter(it => it.chosen !== it.answer)
    return (
      <div className="pane-scroll">
        <div className="pane narrow">
          <div className="result">
            <div className="ring" style={{ "--p": pct }}><span>{pct}%</span></div>
            <div>
              <h1>{score} of {items.length} correct</h1>
              <p className="muted">{pct >= 80 ? "Great work. You know this well." : pct >= 50 ? "Good start. Review the ones below." : "Read the pages below, then try again."}</p>
            </div>
          </div>
          {wrong.length > 0 && (
            <section className="review">
              <h2>Review your mistakes</h2>
              {wrong.map(it => (
                <div key={it.i} className="review-item">
                  <p className="review-q">{it.question}</p>
                  <p className="small"><span className="tag bad">Your answer</span> {it.chosen}</p>
                  <p className="small"><span className="tag good">Correct</span> {it.answer}</p>
                  {it.explanation && <p className="muted small">{it.explanation}</p>}
                  {it.page ? <button className="source-pill" onClick={() => onCite(Number(it.page))}>Open page {it.page}</button> : null}
                </div>
              ))}
            </section>
          )}
          <div className="row">
            <button className="btn" onClick={() => set({ answers: {}, index: 0 })}><RotateCcw size={15} />Try the same quiz</button>
            <button className="btn primary" onClick={() => onUpdate({ items: [] })}><Sparkles size={15} />New quiz</button>
          </div>
        </div>
      </div>
    )
  }

  const it = items[index]
  const chosen = answers[index]
  const revealed = chosen !== undefined

  return (
    <div className="pane-scroll">
      <div className="pane narrow">
        <div className="progress-top">
          <span className="muted small">Question {index + 1} of {items.length}</span>
          <div className="track"><div style={{ width: `${((index + (revealed ? 1 : 0)) / items.length) * 100}%` }} /></div>
        </div>
        <div className="qcard">
          <div className="qtitle"><Markdown>{it.question}</Markdown></div>
          <div className="choices" role="radiogroup">
            {it.options.map((opt, oi) => {
              let cls = "choice"
              if (revealed && opt === it.answer) cls += " right"
              else if (revealed && opt === chosen) cls += " wrong"
              else if (revealed) cls += " dim"
              return (
                <button key={opt} className={cls} role="radio" aria-checked={chosen === opt} disabled={revealed}
                  onClick={() => set({ answers: { ...answers, [index]: opt } })}>
                  <span className="key">{"ABCD"[oi] || oi + 1}</span>
                  <span className="choice-text">{opt}</span>
                  {revealed && opt === it.answer && <Check size={16} />}
                  {revealed && opt === chosen && opt !== it.answer && <X size={16} />}
                </button>
              )
            })}
          </div>
          {revealed && (
            <div className={`explain ${chosen === it.answer ? "good" : "bad"}`}>
              <strong>{chosen === it.answer ? "Correct." : "Not quite."}</strong> {it.explanation}
              {it.page ? <button className="cite" onClick={() => onCite(Number(it.page))}>p. {it.page}</button> : null}
            </div>
          )}
        </div>
        <div className="row end">
          <button className="btn primary" disabled={!revealed} onClick={() => set({ index: index + 1 })}>
            {index + 1 === items.length ? "See results" : "Next question"}<ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
