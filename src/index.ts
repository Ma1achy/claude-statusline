// Entry point: dispatch on argv, then read stdin and print the statusline.
// Everything is wrapped so a bug prints a minimal line instead of a blank bar.
import { R, DIM } from './ansi';
import { cfg } from './config';
import { runPreview, runDoctor, runReport, runMigrate, runRun, runRunClear, runWatch, runHook } from './cli';
import { readInput } from './io/input';
import { refreshGitCache } from './io/gitcache';
import { build } from './build';

const cliArg = process.argv[2];
if (cliArg === '--preview') runPreview();
else if (cliArg === '--doctor') runDoctor();
else if (cliArg === '--report') runReport();
else if (cliArg === '--migrate') runMigrate();
else if (cliArg === '--run') runRun(process.argv.slice(3));
else if (cliArg === '--run-clear') runRunClear(process.argv.slice(3));
else if (cliArg === '--watch') runWatch(process.argv.slice(3));
else if (cliArg === '--hook') runHook();
else if (cliArg === '--git-refresh') {
  // Detached background invocation: warm the git cache, print nothing.
  refreshGitCache(readInput());
}
else if (cliArg && cliArg.startsWith('-')) {
  process.stdout.write('claude-statusline — a statusline command for Claude Code.\n\n'
    + 'Usage: reads Claude Code JSON on stdin and prints the statusline.\n\n'
    + 'Commands:\n  --preview   render every theme / bar style / shimmer\n'
    + '  --doctor    report terminal capabilities, active config, and conflicts\n'
    + '  --report    summarise cross-session usage history\n'
    + '  --migrate   translate a legacy SL_* env block to JSON config (on stdout)\n'
    + '  --run <name> [current total] [--step N --steps N --epoch N --epochs N --percent P\n'
    + '              --metric group.name=V --stage N/M[:label] --unit U --status S --message M --pid N]\n'
    + '              write/update a run-progress file (see "Run progress" in the README)\n'
    + '  --run-clear <name>  remove a run-progress file\n'
    + '  --watch <log> [--name N --pid P --stage RE --stages N --inner TPL --pattern RE --of N]\n'
    + '              follow a job\'s log and keep its progress file current until it ends\n'
    + '  --hook      PostToolUse hook: watch every background Bash command\'s output\n'
    + '  --help      this message\n\n'
    + 'Configure via ~/.claude/statusline.json (or $SL_CONFIG) — see the README.\n');
} else {
  try {
    const out = build();
    // SL_TMUX_PASSTHROUGH: wrap in the tmux DCS so truecolor survives the
    // multiplexer (requires `set -g allow-passthrough on` in tmux ≥3.3).
    process.stdout.write(cfg.tmuxPassthrough ? `\x1bPtmux;${out.replace(/\x1b/g, '\x1b\x1b')}\x1b\\` : out);
  } catch (e) {
    // Never blank the statusline — emit one minimal line.
    process.stdout.write(`${DIM}claude-statusline: ${(e && (e as Error).message) || 'error'}${R}\n`);
  }
}
