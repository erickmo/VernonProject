import { Component, ReactNode } from 'react'

interface Props { children: ReactNode; fallback: ReactNode }
interface State { failed: boolean }

export class AvatarBoundary extends Component<Props, State> {
  state: State = { failed: false }
  static getDerivedStateFromError(): State { return { failed: true } }
  componentDidCatch() { /* swallow: WebGL-unavailable / GLB load errors render the fallback */ }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}
