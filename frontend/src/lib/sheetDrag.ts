// Pure helpers for the todo bottom sheet's drag-to-dismiss (TodoOverlay.tsx).
export function clampDragY(deltaY: number): number {
  return Math.max(0, deltaY)
}

export function shouldDismissSheet(dragY: number, dismissPx = 100): boolean {
  return dragY > dismissPx
}
