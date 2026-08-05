/**
 * Minimal Markdown → HTML formatter for AI assistant replies: bold, lists,
 * tables, paragraphs. Not a full Markdown spec — matches only what the
 * backend's responses actually use. Escapes HTML first to prevent XSS.
 */
export function formatMarkdown(text: string | undefined | null): string {
  if (!text) return ''
  let html = text

  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  html = html.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')

  html = html.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
  html = html.replace(/<\/ul>\s*<ul>/g, '')

  const lines = html.split('\n')
  let inTable = false
  let tableHtml = ''
  const outputLines: string[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line.startsWith('|') && line.endsWith('|')) {
      if (line.includes('---')) continue
      const cells = line.split('|').map((c) => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
      if (!inTable) {
        inTable = true
        tableHtml = `<table><thead><tr>${cells.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>`
      } else {
        tableHtml += `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`
      }
    } else {
      if (inTable) {
        inTable = false
        tableHtml += '</tbody></table>'
        outputLines.push(tableHtml)
        tableHtml = ''
      }
      outputLines.push(rawLine)
    }
  }
  if (inTable) {
    tableHtml += '</tbody></table>'
    outputLines.push(tableHtml)
  }
  html = outputLines.join('\n')

  html = html.replace(/\n\n/g, '</p><p>')
  html = html.replace(/\n/g, '<br>')
  html = `<p>${html}</p>`
  html = html.replace(/<p><\/p>/g, '')

  return html
}
