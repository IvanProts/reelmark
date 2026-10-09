#!/usr/bin/env node
// PreToolUse guard for the Bash tool: blocks shell commands that could read a
// secret env file (.env, .env.local, prod.env, .envrc, …) — directly, through
// a glob, or by searching folders recursively. *.env.example templates are
// allowed. Agents should start the app to load secrets, never read them.
//
// This is text matching, so it raises the bar for accidents and casual
// misuse; it cannot stop deliberate obfuscation. OS-level sandboxing is the
// stronger layer (see docs/BACKLOG.md).

const REASON_FILE =
  'commands must not touch secret .env files (only *.env.example). Start the app to load secrets instead.';
const REASON_SEARCH =
  "recursive search could read secret .env files. Add --exclude='.env*' to grep, or use rg without -u (it skips git-ignored files).";

const READERS =
  '(?:[efz]?grep|rgrep|cat|head|tail|less|more|sed|awk|strings|od|xxd|base64|nl|cut|sort|uniq)';

let raw = '';
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let command = '';
  try {
    command = JSON.parse(raw)?.tool_input?.command ?? '';
  } catch {
    return; // not a Bash payload we understand: let other rules decide
  }
  const reason = check(command);
  if (reason) deny(reason);
});

/** Returns why the command is blocked, or null. */
function check(command) {
  const excludesEnvFiles = /--exclude=(['"]?)\.env/.test(command);

  const cleaned = command
    .replace(/\.env\.example\b/g, '') // templates are fine
    .replace(/--exclude=(['"]?)\.env[^\s'"]*\1/g, '') // naming env files only to skip them
    .replace(/\b(?:process|import\.meta)\.env\b/g, ''); // JS code, not a file

  // 1) Names an env file: .env, .env.local, prod.env, .envrc, .env_backup …
  if (/\.env(?:rc)?(?:\b|[_-])|--env-file|\bdotenv\b/i.test(cleaned)) return REASON_FILE;

  // 2) A glob that could expand to an env file: .e*, .en?, .[e]nv, .*
  if (/(?:^|[\s/'"=])\.(?:e(?:n)?)?[*?[]/.test(cleaned)) return REASON_FILE;

  // 3) Recursive search: walks folders and reads every file in them,
  //    including .env, without the command ever naming it.
  const recursiveGrep = new RegExp(
    String.raw`\b(?:[efz]?grep)\b[^|;&]*\s(?:-[A-Za-z]*[rR][A-Za-z]*|--recursive|--dereference-recursive)\b|\brgrep\b`,
  ).test(command);
  if (recursiveGrep && !excludesEnvFiles) return REASON_SEARCH;
  if (/\brg\b[^|;&]*\s(?:-[A-Za-z]*u|--no-ignore)/.test(command)) return REASON_SEARCH;
  if (/\bgit\s+grep\b[^|;&]*--no-index/.test(command)) return REASON_SEARCH;
  // find … -exec grep / … | xargs cat — reads whatever find matched.
  if (
    new RegExp(String.raw`(?:-exec(?:dir)?|\bxargs\b)\s+(?:\S+\s+)*?${READERS}\b`).test(command)
  ) {
    return REASON_SEARCH;
  }
  // tar … -O / --to-stdout: prints archived files (e.g. a whole folder) to stdout.
  if (/\btar\b[^|;&]*\s(?:-[A-Za-z]*O[A-Za-z]*|--to-stdout)\b/.test(command)) return REASON_SEARCH;

  return null;
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `Blocked by .claude/hooks/guard-env.mjs: ${reason}`,
      },
    }),
  );
}
