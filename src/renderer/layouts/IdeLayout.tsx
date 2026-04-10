import type { ReactNode } from 'react';

/** IDE shell: optional left sidebar | note tabs + main + optional right rail */
export function IdeLayout({
  sidebar,
  sidebarVisible,
  children,
  tabBar,
  rail,
  edgePeek,
}: {
  sidebar: ReactNode;
  sidebarVisible: boolean;
  children: ReactNode;
  /** Horizontal note tabs above the editor */
  tabBar?: ReactNode;
  rail?: ReactNode;
  /** Shown along the left edge of the editor when the sidebar is hidden */
  edgePeek?: ReactNode;
}) {
  return (
    <div className="flex flex-1 overflow-hidden min-h-0">
      {sidebarVisible && sidebar}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {tabBar}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
          {!sidebarVisible && edgePeek}
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
          {rail}
        </div>
      </div>
    </div>
  );
}
