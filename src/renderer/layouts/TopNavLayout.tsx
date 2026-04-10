import type { ReactNode } from 'react';

/** Top navigation shell: one column (typically category bar + note list row + editor from Sidebar layout=top). */
export function TopNavLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 overflow-hidden min-h-0 flex-col min-w-0">
      {children}
    </div>
  );
}
