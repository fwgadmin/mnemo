/** `mnemo attachments …` — attachment statistics, inline-media conversion, unused-file cleanup. */
import type { OpenStore } from './cliSheet';
import { attachmentStats, convertInlineMedia, removeUnusedAttachments } from './attachmentMaintenance';

export const ATTACHMENTS_USAGE = `Usage:
  mnemo attachments [stats] [--json]      counts and sizes for the workspace
  mnemo attachments convert               move base64 data: media inside notes into stored attachments
  mnemo attachments gc [--dry-run]        delete attachments no note references (older than 24 h)
Global flags: --workspace, --db, --vault (same as mnemo note …)`;

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function cmdAttachments(argvIn: string[], openStore: OpenStore): Promise<void> {
  const argv = [...argvIn];
  const sub = (argv[0] && !argv[0].startsWith('-') ? argv.shift()! : 'stats').toLowerCase();
  const json = argv.includes('--json');
  const dryRun = argv.includes('--dry-run');
  const rest = argv.filter(a => a !== '--json' && a !== '--dry-run');
  if (sub === 'help' || sub === '--help' || sub === '-h') {
    console.log(ATTACHMENTS_USAGE);
    return;
  }
  const { store, tenantId } = await openStore(rest);
  try {
    if (sub === 'stats') {
      const s = await attachmentStats(store, tenantId);
      if (json) console.log(JSON.stringify(s));
      else
        console.log(
          `Attachments: ${s.count} (${mb(s.bytes)})\nUnused (older than 24 h): ${s.unused} (${mb(s.unusedBytes)})\nNotes with inline data: media: ${s.notesWithInlineMedia}`,
        );
    } else if (sub === 'convert') {
      const r = await convertInlineMedia(store, tenantId);
      console.log(json ? JSON.stringify(r) : `Converted ${r.converted} file(s) in ${r.notes} note(s); left inline: ${r.skipped}.`);
    } else if (sub === 'gc') {
      const r = await removeUnusedAttachments(store, tenantId, { dryRun });
      console.log(json ? JSON.stringify({ ...r, dryRun }) : `${dryRun ? 'Would remove' : 'Removed'} ${r.removed} file(s) (${mb(r.bytes)}).`);
    } else {
      throw new Error(`Unknown attachments command “${sub}”.\n${ATTACHMENTS_USAGE}`);
    }
  } finally {
    store.close();
  }
}
