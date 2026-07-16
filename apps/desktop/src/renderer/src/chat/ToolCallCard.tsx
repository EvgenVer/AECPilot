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
    <div className="tool-card">
      <button
        type="button"
        className="tool-card__head"
        onClick={() => setExpanded((value) => !value)}
      >
        <span>⚙ {call.name}</span>
        <span className="tool-card__context">{call.context}</span>
        {call.status === 'running' ? (
          <span className="tool-card__status tool-card__status--running">выполняется…</span>
        ) : (
          call.durationS !== undefined && (
            <span className="tool-card__status">{call.durationS.toFixed(1)}s</span>
          )
        )}
      </button>

      {expanded && (
        <div className="tool-card__body">
          {call.args !== undefined && (
            <pre className="tool-card__pre">{JSON.stringify(call.args, null, 2)}</pre>
          )}
          {call.result !== undefined && (
            <>
              <pre className="tool-card__pre">
                {displayedResult}
                {!showFullResult && resultIsTruncated && '…'}
              </pre>
              {resultIsTruncated && (
                <button
                  type="button"
                  className="tool-card__more"
                  onClick={() => setShowFullResult((value) => !value)}
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
