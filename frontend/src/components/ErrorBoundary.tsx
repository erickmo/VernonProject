import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

// Last-resort guard so a render error shows a readable message + recovery action
// instead of a blank white screen. Most likely cause in practice is a stale
// persisted query cache whose shape no longer matches the current code — the
// "Reset & reload" button clears local storage and reloads into a clean state.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  handleReset = () => {
    try {
      window.localStorage.clear()
    } catch {
      /* ignore */
    }
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
        <h1 className="text-lg font-bold text-slate-900">Something went wrong</h1>
        <p className="max-w-sm text-sm text-slate-500">
          The app hit an error. Resetting clears local data and reloads a fresh copy.
        </p>
        <pre className="max-w-full overflow-auto rounded-lg bg-slate-100 p-3 text-left text-xs text-rose-600">
          {this.state.error.message}
        </pre>
        <button
          onClick={this.handleReset}
          className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white active:scale-95"
        >
          Reset &amp; reload
        </button>
      </div>
    )
  }
}
