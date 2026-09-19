import clsx from 'clsx'
import { useMcpStatus } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { parseFrappeError } from '@/lib/format'
import {
  mcpAriaLabel,
  mcpDotClass,
  mcpLabel,
  mcpTextClass,
  mcpTooltip,
  stateFromQuery,
} from '@/lib/mcpStatus'

/** The MCP connector's state, for the navbar. ONE component, used by /w's TopBar and
 *  /m's TabScreen header — there is no second implementation and no second poll.
 *
 *  It never blocks first paint: with no answer yet the state is `unknown` and the
 *  navbar renders immediately, updating when the probe returns.
 *
 *  Hover gives the tooltip; tapping shows the same text in a toast, which is the only
 *  way to read it on a touch screen. The DETAIL inside that text exists only if the
 *  server chose to send it — a non-admin's payload has none, so this cannot reveal
 *  the target or the error to someone the server would not tell.
 *
 *  `labelled` is off on /m, where the header is tight and the dot plus its accessible
 *  name carry the meaning; /w has room for the word.
 */
export function McpStatusIndicator({ labelled = true }: { labelled?: boolean }) {
  const { data, isError, error } = useMcpStatus()
  const toast = useToast()

  const state = stateFromQuery(data, isError)
  const errorText = isError
    ? parseFrappeError(error instanceof Error ? error.message : String(error ?? ''))
    : null
  const tooltip = mcpTooltip(state, data, errorText)

  return (
    <button
      type="button"
      onClick={() => toast('info', tooltip)}
      title={tooltip}
      aria-label={mcpAriaLabel(state)}
      className="flex shrink-0 items-center gap-1.5 rounded-full px-1.5 py-1 transition active:scale-95"
    >
      <span aria-hidden className={clsx('h-2 w-2 rounded-full', mcpDotClass(state))} />
      {labelled && (
        <span className={clsx('text-xs font-medium', mcpTextClass(state))}>{mcpLabel(state)}</span>
      )}
    </button>
  )
}
