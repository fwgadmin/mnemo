/**
 * Position a fixed context menu with its top-left at (clientX, clientY), then adjust so it
 * stays in the viewport — flips above the cursor when there is not enough room below.
 */
export function clampFixedContextMenu(
  clientX: number,
  clientY: number,
  menuWidth: number,
  menuHeight: number,
  margin = 8,
): { left: number; top: number } {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
  if (menuWidth <= 0 || menuHeight <= 0) {
    return {
      left: Math.min(Math.max(margin, clientX), vw - margin),
      top: Math.min(Math.max(margin, clientY), vh - margin),
    };
  }

  let left = clientX;
  if (left + menuWidth > vw - margin) {
    left = Math.max(margin, vw - menuWidth - margin);
  }
  if (left < margin) left = margin;

  let top = clientY;
  if (top + menuHeight > vh - margin) {
    const aboveTop = clientY - menuHeight;
    if (aboveTop >= margin) {
      top = aboveTop;
    } else {
      top = Math.max(margin, vh - menuHeight - margin);
    }
  }

  return { left, top };
}
