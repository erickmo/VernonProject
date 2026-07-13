// Single source of truth for "is this the standalone todo-detail route".
// One path segment after /project-item/ (nested item routes and /project-detail
// are deliberately excluded — they render in place, not in the drawer).
const TODO_PATH = /^\/project-item\/[^/]+$/

export function isTodoPath(path: string): boolean {
  return TODO_PATH.test(path)
}
