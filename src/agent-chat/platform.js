import { appHome, exec } from "herdr";
import { onWindows } from "./python.js";

export { base64Utf8, onWindows, python } from "./python.js";

/** A file of this mod, as a path for programs to open. */
export function modFile(name) {
  return onWindows() ? `${appHome()}\\mods\\agent-chat\\${name}` : `${appHome()}/mods/agent-chat/${name}`;
}

/** `s` as a PowerShell single-quoted string. */
export function psQuote(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

/** Deletes files on this computer, quietly (ones already gone are fine). */
export function removeFiles(files) {
  if (!files.length) return;
  (onWindows()
    ? exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Remove-Item -Force -ErrorAction SilentlyContinue -LiteralPath ${files.map(psQuote).join(", ")}`])
    : exec("rm", ["-f", "--", ...files])).catch(() => null);
}

/**
 * Deletes the files in `dir`, and the folders in it, older than a day, except those named in `keep` and the folders
 * named in `spare`.
 */
export function pruneOld(dir, keep = [], spare = []) {
  const skip = [...keep.flatMap(name => ["!", "-name", name]), ...spare.flatMap(name => ["!", "-path", `*/${name}/*`])];
  (onWindows()
    ? exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
        `$keep = @(${keep.map(psQuote).join(", ")}); $spare = @(${spare.map(psQuote).join(", ")}); Get-ChildItem -LiteralPath ${psQuote(dir)} -File -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-1) -and $keep -notcontains $_.Name -and $spare -notcontains $_.Directory.Name } | Remove-Item -Force`])
    : exec("sh", ["-c", '[ -d "$1" ] || exit 0; d=$1; shift; find "$d" -type f -mmin +1440 "$@" -delete; exit 0', "sh", dir, ...skip])).catch(() => null);
}
