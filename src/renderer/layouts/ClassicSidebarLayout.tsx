import type { ReactNode } from 'react';

/** Classic shell: optional left sidebar | main | optional right rail */
export function ClassicSidebarLayout({
  sidebar,
  sidebarVisible,
  children,
  rail,
  edgePeek,
}: {
  sidebar: ReactNode;
  sidebarVisible: boolean;
  children: ReactNode;
  rail?: ReactNode;
  /** Shown along the left edge of the main area when the sidebar is hidden */
  edgePeek?: ReactNode;
}) {
  return (
    <div className="flex flex-1 overflow-hidden min-h-0">
      {sidebarVisible && sidebar}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {!sidebarVisible && edgePeek}
        <main className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">{children}</main>
      </div>
      {rail}
    </div>
  );
}
