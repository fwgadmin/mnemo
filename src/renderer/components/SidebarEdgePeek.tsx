/**
 * Narrow hit zone on the left edge of the main area when the sidebar is hidden.
 * Reveals a chevron on hover so users can reopen the sidebar without the hotkey.
 */
export default function SidebarEdgePeek({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="absolute left-0 top-0 bottom-0 z-[100] w-10 pointer-events-auto">
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          onOpen();
        }}
        className="group flex h-full w-full cursor-pointer items-center justify-start border-0 bg-transparent p-0 pl-0.5 outline-none focus-visible:ring-2 focus-visible:ring-mnemo-accent/50"
        aria-label="Show sidebar"
        title="Show sidebar (Ctrl+B)"
      >
        <span
          className={`
            flex h-24 max-h-[45vh] min-h-[48px] w-5 items-center justify-center rounded-r-md
            border border-mnemo-border border-l-0 bg-mnemo-panel-elevated/95 text-lg leading-none text-mnemo-muted shadow-md
            opacity-0 transition-opacity duration-150
            group-hover:opacity-100 hover:bg-mnemo-hover hover:text-mnemo-text
          `}
        >
          ›
        </span>
      </button>
    </div>
  );
}
