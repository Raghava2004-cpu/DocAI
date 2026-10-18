export const API = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/+$/, "")

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

function parse(status, text) {
  let data = null
  try { data = JSON.parse(text) } catch { /* not JSON */ }
  if (status < 200 || status >= 300) {
    const msg = data?.detail || (status === 0 ? "Could not reach the server." : `Server error ${status}. Please try again.`)
    throw new ApiError(msg, status)
  }
  if (!data) throw new ApiError("The server sent an unexpected reply. Please try again.", status)
  return data
}

export async function getJSON(path, { timeout = 90000 } = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(`${API}${path}`, { signal: ctrl.signal })
    return parse(res.status, await res.text())
  } finally {
    clearTimeout(t)
  }
}

export async function postJSON(path, body) {
  let res
  try {
    res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError("Could not reach the server. Check your connection and try again.", 0)
  }
  return parse(res.status, await res.text())
}

export function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", `${API}/upload`)
    xhr.upload.onprogress = e => e.lengthComputable && onProgress?.(e.loaded / e.total)
    xhr.upload.onload = () => onProgress?.(1)
    xhr.onload = () => {
      try { resolve(parse(xhr.status, xhr.responseText)) } catch (e) { reject(e) }
    }
    xhr.onerror = () => reject(new ApiError("Could not reach the server. Check your connection and try again.", 0))
    const form = new FormData()
    form.append("file", file)
    xhr.send(form)
  })
}

/**
 * Streams an answer. Calls onToken(text) for each piece, returns the final {answer, sources, snippets}.
 * Throws ApiError. err.partial is true if some text already arrived.
 */
export async function streamAnswer(body, { onToken, signal }) {
  const res = await fetch(`${API}/ask_stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) parse(res.status, await res.text())

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let got = false
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line) continue
      const evt = JSON.parse(line)
      if (evt.type === "token") { got = true; onToken(evt.text) }
      else if (evt.type === "done") return evt
      else if (evt.type === "error") {
        const err = new ApiError(evt.message, 502)
        err.partial = got
        throw err
      }
    }
  }
  const err = new ApiError("The answer stopped early. Please try again.", 502)
  err.partial = got
  throw err
}
