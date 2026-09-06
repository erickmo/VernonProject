// Single source of truth for "is this the standalone todo-detail route", shared by
// both frontends' modal-route interceptor (web's side drawer, mobile's slide-over).
// One path segment after /project-item/ (nested item routes and /project-detail
// are deliberately excluded — they render in place, not in the overlay).
const TODO_PATH = /^\/project-item\/[^/]+$/

export function isTodoPath(path: string): boolean {
  return TODO_PATH.test(path)
}
