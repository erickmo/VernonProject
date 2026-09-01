// One shared LIFO of open modal/overlay layers, so only the TOP-most one reacts
// to Escape. Without it, an overlay opened inside another (e.g. a confirm inside
// the todo drawer, a date picker inside a dialog) would have BOTH layers' Escape
// fire on one press — closing the parent out from under the child.
//
// Every overlay that closes on Escape pushes a token while open and gates its
// handler on isTopModal(token). Order of keydown listeners no longer matters:
// all fire, only the top one acts. Web overlays use this via useModalA11y; the
// shared (mobile) confirms/dialogs use it via useModalEscape.
const stack: symbol[] = []

export function pushModal(): symbol {
  const token = Symbol()
  stack.push(token)
  return token
}

export function popModal(token: symbol): void {
  const i = stack.indexOf(token)
  if (i >= 0) stack.splice(i, 1)
}

export function isTopModal(token: symbol): boolean {
  return stack[stack.length - 1] === token
}

// True while any overlay is open — used by full-screen routes (e.g. the /m todo
// screen) to suppress their own Escape-to-go-back while a dialog sits on top.
export function anyModalOpen(): boolean {
  return stack.length > 0
}
