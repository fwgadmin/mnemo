/**
 * Tiny label shown when a background poll applies newer content from the server to the open note.
 */
export default function RemoteUpdateIndicator({ visible }: { visible: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute top-1.5 right-2 z-10 select-none rounded px-1.5 py-px text-[9px] font-medium tracking-wide text-mnemo-dim/90 bg-mnemo-panel-elevated/85 border border-mnemo-border/50 shadow-sm backdrop-blur-[2px] transition-opacity duration-500 ease-out ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      title="Note updated from the server"
      aria-live="polite"
      aria-atomic="true"
    >
      Synced
    </div>
  );
}
