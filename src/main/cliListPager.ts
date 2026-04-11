/**
 * Interactive TTY pager for `mnemo list` (keyboard navigation).
 */
import * as readline from 'readline';

/** Default rows per page when `mnemo list` runs in the interactive TTY pager. */
export const DEFAULT_LIST_PAGE_SIZE = 50;

export type ListPagerMeta = {
  /** Total notes after filters (sorted). */
  totalNotes: number;
  /** Shown under the page line, e.g. "folder: Work" or "all notes". */
  contextLine: string;
  /** 0-based starting page (from --from). */
  initialPageIndex: number;
  /** Rows per page (from --pager-size or default). */
  pageSize: number;
};

type KeyCmd =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'enter'
  | 'q'
  | 'ignore';

/** TTY height; fallback when not available. */
function getTerminalRows(): number {
  const r = process.stdout.rows;
  return typeof r === 'number' && r >= 4 ? r : 24;
}

/** Lines reserved for the pagination / key hints footer (must match footer string). */
const FOOTER_LINE_COUNT = 2;

/**
 * First visible row index so `selectedIdx` stays within the viewport when the list is taller than the screen.
 */
function computeScrollOffset(selectedIdx: number, n: number, listHeight: number): number {
  if (n <= 0 || listHeight <= 0) return 0;
  if (n <= listHeight) return 0;
  const maxScroll = n - listHeight;
  if (selectedIdx < listHeight) return 0;
  return Math.min(Math.max(0, selectedIdx - listHeight + 1), maxScroll);
}

function parseKeypress(str: string | undefined, key?: readline.Key): KeyCmd {
  const raw = str ?? '';
  const name = key?.name;

  if (key?.ctrl && key.name === 'c') {
    return 'ignore';
  }

  if (name === 'escape') {
    return 'ignore';
  }

  if (name === 'up') return 'up';
  if (name === 'down') return 'down';
  if (name === 'left') return 'left';
  if (name === 'right') return 'right';

  if (name === 'return' || name === 'enter') return 'enter';
  if (raw === '\r' || raw === '\n') return 'enter';

  if (raw.startsWith('\u001b')) {
    return 'ignore';
  }

  if (name === 'q' || name === 'Q') return 'q';
  if (raw.length > 0) {
    const ch0 = raw.charAt(0).toLowerCase();
    if (ch0 === 'q') return 'q';
  }

  return 'ignore';
}

/**
 * Run full-screen pager: pages are display lines; refsPerPage aligns 1:1 for opening the editor.
 */
export async function runInteractiveListPager(
  pages: string[][],
  refsPerPage: number[][],
  meta: ListPagerMeta,
  onEditRef: (ref: number) => Promise<void>,
): Promise<void> {
  const pageSize = meta.pageSize;
  const totalPages = Math.max(1, pages.length);
  let pageIdx = Math.min(Math.max(0, meta.initialPageIndex), totalPages - 1);
  let selectedIdx = 0;

  const stdin = process.stdin;
  const stdout = process.stdout;

  let rl: readline.Interface | undefined;

  const setup = (): void => {
    if (stdin.isTTY) {
      stdin.resume();
    }
    rl = readline.createInterface({
      input: stdin,
      output: stdout,
      terminal: true,
    });
    readline.emitKeypressEvents(stdin, rl);
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
  };

  const teardown = (): void => {
    if (stdin.isTTY) {
      try {
        stdin.setRawMode(false);
      } catch {
        /* ignore */
      }
    }
    try {
      rl?.close();
    } catch {
      /* ignore */
    }
    rl = undefined;
  };

  const render = (): void => {
    const lines = pages[pageIdx] ?? [];
    const refs = refsPerPage[pageIdx] ?? [];
    const n = lines.length;
    if (n > 0) {
      selectedIdx = Math.min(Math.max(0, selectedIdx), n - 1);
    } else {
      selectedIdx = 0;
    }

    const termRows = getTerminalRows();
    const listHeight = Math.max(1, termRows - FOOTER_LINE_COUNT);
    const scrollOffset = computeScrollOffset(selectedIdx, n, listHeight);

    console.clear();
    for (let row = 0; row < listHeight; row++) {
      const i = scrollOffset + row;
      if (i < n) {
        const line = lines[i]!;
        const isSel = i === selectedIdx;
        if (isSel) {
          console.log('\x1b[7m' + line + '\x1b[0m');
        } else {
          console.log(line);
        }
      } else {
        console.log('');
      }
    }

    const start = meta.totalNotes === 0 ? 0 : pageIdx * pageSize + 1;
    const end = Math.min((pageIdx + 1) * pageSize, meta.totalNotes);
    const footer =
      `— Page ${pageIdx + 1}/${totalPages} · notes ${start}-${end} of ${meta.totalNotes} · ${meta.contextLine} —\n` +
      `  ↑↓ select   Enter open in editor   ←→ prev/next page   q quit`;
    process.stdout.write(footer + '\n');
  };

  const waitKey = (): Promise<KeyCmd> =>
    new Promise((resolve) => {
      const onKey = (str: string | undefined, key?: readline.Key): void => {
        stdin.removeListener('keypress', onKey);
        if (key?.ctrl && key.name === 'c') {
          teardown();
          process.exit(0);
        }
        try {
          resolve(parseKeypress(str, key));
        } catch {
          resolve('ignore');
        }
      };
      stdin.on('keypress', onKey);
    });

  setup();
  try {
    for (;;) {
      render();
      let cmd: KeyCmd;
      do {
        cmd = await waitKey();
      } while (cmd === 'ignore');

      const lines = pages[pageIdx] ?? [];
      const refs = refsPerPage[pageIdx] ?? [];
      const lineCount = lines.length;

      if (cmd === 'q') break;

      if (cmd === 'left') {
        pageIdx = Math.max(0, pageIdx - 1);
        selectedIdx = 0;
        continue;
      }
      if (cmd === 'right') {
        pageIdx = Math.min(totalPages - 1, pageIdx + 1);
        selectedIdx = 0;
        continue;
      }

      if (lineCount === 0) {
        continue;
      }

      selectedIdx = Math.min(Math.max(0, selectedIdx), lineCount - 1);

      if (cmd === 'up') {
        selectedIdx = Math.max(0, selectedIdx - 1);
        continue;
      }
      if (cmd === 'down') {
        selectedIdx = Math.min(lineCount - 1, selectedIdx + 1);
        continue;
      }

      if (cmd === 'enter') {
        const ref = refs[selectedIdx];
        if (ref == null) {
          continue;
        }
        teardown();
        try {
          await onEditRef(ref);
        } finally {
          setup();
        }
        continue;
      }
    }
  } finally {
    teardown();
  }
}
