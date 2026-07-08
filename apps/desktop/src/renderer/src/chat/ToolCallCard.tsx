import { useState } from 'react'
import type { ChatToolCall } from './chat-state'

const RESULT_PREVIEW_LIMIT = 4000

export default function ToolCallCard({ call }: { call: ChatToolCall }) {
  const [expanded, setExpanded] = useState(false)
  const [showFullResult, setShowFullResult] = useState(false)

  const result = call.result ?? ''
  const resultIsTruncated = result.length > RESULT_PREVIEW_LIMIT
  const displayedResult =
    showFullResult || !resultIsTruncated ? result : result.slice(0, RESULT_PREVIEW_LIMIT)

  return (
    <div
      style={{
        alignSelf: 'flex-start',
        maxWidth: '75%',
        borderRadius: 8,
        background: '#f7f5ee',
        border: '1px solid #e2ddc9',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 13
      }}
    >
      <button
        onClick={() => setExpanded((value) => !value)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          width: '100%',
          padding: '6px 10px',
          background: 'transparent',
          border: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          font: 'inherit',
          color: 'inherit'
        }}
      >
        <span>
          ⚙ {call.name} — {call.context}
        </span>
        {call.status === 'running' ? (
          <span style={{ opacity: 0.6, animation: 'pulse 1.5s ease-in-out infinite' }}>
            выполняется…
          </span>
        ) : (
          <span style={{ opacity: 0.6 }}>{call.durationS?.toFixed(1)}s</span>
        )}
      </button>

      {expanded && (
        <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {call.args !== undefined && (
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 12,
                background: '#fff',
                border: '1px solid #e2ddc9',
                borderRadius: 4,
                padding: 6
              }}
            >
              {JSON.stringify(call.args, null, 2)}
            </pre>
          )}
          {call.result !== undefined && (
            <>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 12,
                  background: '#fff',
                  border: '1px solid #e2ddc9',
                  borderRadius: 4,
                  padding: 6
                }}
              >
                {displayedResult}
                {!showFullResult && resultIsTruncated && '…'}
              </pre>
              {resultIsTruncated && (
                <button
                  onClick={() => setShowFullResult((value) => !value)}
                  style={{
                    alignSelf: 'flex-start',
                    background: 'transparent',
                    border: 'none',
                    color: '#357',
                    cursor: 'pointer',
                    font: 'inherit',
                    fontSize: 12,
                    padding: 0
                  }}
                >
                  {showFullResult ? 'свернуть' : 'показать полностью'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
