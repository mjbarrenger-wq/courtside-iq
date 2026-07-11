'use client'

// Triggers the browser's print dialog (Save as PDF). The page carries an
// `@page { size: A4 landscape }` rule + print styles so the output is A4-optimised.
export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print"
      style={{
        fontSize: 12, fontWeight: 700, color: '#fff', background: '#307b92',
        border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
      }}
    >
      ⤓ Export PDF
    </button>
  )
}
