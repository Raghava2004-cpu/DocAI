import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import "katex/dist/katex.min.css"

// "(p. 3)" or "(pp. 3–5)" -> a markdown link the renderer turns into a clickable chip
const CITE = /\((pp?\.)\s*(\d+)(?:\s*[–-]\s*(\d+))?\)/g

function linkCitations(text) {
  return text.replace(CITE, (_, __, a, b) => (b ? `[p. ${a}–${b}](#page-${a})` : `[p. ${a}](#page-${a})`))
}

// The model sometimes writes \( \) and \[ \] — remark-math wants $ and $$
function normalizeMath(text) {
  return text
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `\n$$\n${m.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m}$`)
    // a line that is only $$...$$ becomes a centred block formula
    .replace(/^[ \t]*\$\$([^\n]+?)\$\$[ \t]*$/gm, (_, m) => `$$\n${m.trim()}\n$$`)
}

export default function Markdown({ children, onCite, snippets = {}, streaming = false }) {
  const text = linkCitations(normalizeMath(children || ""))
  return (
    <div className={`md${streaming ? " streaming" : ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          table: props => <div className="table-x"><table {...props} /></div>,
          a({ href = "", children: label, ...rest }) {
            const m = href.match(/^#page-(\d+)$/)
            if (m) {
              const page = Number(m[1])
              const snip = snippets[String(page)]
              return (
                <button type="button" className="cite" onClick={() => onCite?.(page)} data-tip={snip ? `Page ${page}: ${snip}` : `Open page ${page}`}>
                  {label}
                </button>
              )
            }
            return <a href={href} target="_blank" rel="noreferrer" {...rest}>{label}</a>
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
