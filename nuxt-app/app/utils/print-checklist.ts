export interface ChecklistDoc {
  name: string
  note?: string
}

export interface ChecklistSection {
  title: string
  docs: ChecklistDoc[]
}

/**
 * Opens a blank window and writes a standalone printable HTML checklist —
 * mirrors the legacy downloadDocPDF()/downloadAdmissionChecklistPDF()
 * pattern (no PDF library; relies on the browser's native print-to-PDF).
 */
export function printChecklist(title: string, subtitle: string, sections: ChecklistSection[], warning?: string) {
  const win = window.open('', '_blank')
  if (!win) return

  const sectionsHtml = sections
    .map(
      (section) => `
        <h2>${escapeHtml(section.title)}</h2>
        <table>
          <thead><tr><th style="width:36px">T/r</th><th>Hujjat nomi</th><th>Izoh</th></tr></thead>
          <tbody>
            ${section.docs
              .map(
                (doc, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(doc.name)}</td><td>${escapeHtml(doc.note || '')}</td></tr>`
              )
              .join('')}
          </tbody>
        </table>
      `
    )
    .join('')

  win.document.write(`
    <!doctype html>
    <html lang="uz">
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(title)}</title>
      <style>
        body { font-family: -apple-system, 'Segoe UI', Inter, sans-serif; color: #111827; padding: 32px; max-width: 720px; margin: 0 auto; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .sub { color: #6B7280; font-size: 13px; margin-bottom: 24px; }
        h2 { font-size: 14px; margin: 24px 0 8px; color: #06382D; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        th, td { border: 1px solid #E5E7EB; padding: 8px 10px; font-size: 12.5px; text-align: left; vertical-align: top; }
        th { background: #F8FAFC; font-weight: 600; }
        .warning { margin-top: 20px; padding: 12px 14px; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; font-size: 12.5px; color: #92400E; }
        .print-btn { margin-bottom: 20px; padding: 10px 18px; background: #06382D; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
        footer { margin-top: 28px; font-size: 11px; color: #9CA3AF; }
        @media print { .print-btn { display: none; } }
      </style>
    </head>
    <body>
      <button class="print-btn" onclick="window.print()">Chop etish / PDF saqlash</button>
      <h1>${escapeHtml(title)}</h1>
      <p class="sub">${escapeHtml(subtitle)}</p>
      ${sectionsHtml}
      ${warning ? `<div class="warning">${escapeHtml(warning)}</div>` : ''}
      <footer>SalomKorea — ${new Date().toLocaleDateString('uz-UZ')}</footer>
    </body>
    </html>
  `)
  win.document.close()
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
