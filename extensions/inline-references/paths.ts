/**
 * Path resolution of the pi `read` tool.
 *
 * pi does not export its resolver (`resolveToCwd` and `resolveReadPath` in
 * `core/tools/path-utils`), so this module copies its rules: Unicode spaces become normal
 * spaces, a leading `@` is removed, `~` is the home directory, `file://` URLs become paths,
 * relative paths are relative to the cwd, and the macOS variants of a file name are tried when
 * the file does not exist. Keep it in sync with pi when pi changes these rules.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const UNICODE_SPACES = /[  -   　]/g;

/** Absolute path of a file tool argument, as the pi file tools resolve it. */
export function resolveToolPath(input: string, cwd: string, homeDir = os.homedir()): string {
	let normalized = input.replace(UNICODE_SPACES, " ");
	if (normalized.startsWith("@")) normalized = normalized.slice(1);
	return resolveFilePath(normalized, cwd, homeDir);
}

/** Absolute path of `input` relative to `baseDir`, with `~` and `file://` support. */
export function resolveFilePath(input: string, baseDir: string, homeDir = os.homedir()): string {
	let normalized = input;
	if (normalized === "~") normalized = homeDir;
	else if (normalized.startsWith("~/")) normalized = path.join(homeDir, normalized.slice(2));
	else if (/^file:\/\//.test(normalized)) normalized = fileURLToPath(normalized);
	return path.resolve(baseDir, normalized);
}

/** Absolute path of a `read` argument, with the macOS file name variants of the read tool. */
export function resolveReadPath(input: string, cwd: string): string {
	const resolved = resolveToolPath(input, cwd);
	if (fs.existsSync(resolved)) return resolved;
	const amPm = resolved.replace(/ (AM|PM)\./gi, " $1.");
	const nfd = resolved.normalize("NFD");
	const curly = resolved.replace(/'/g, "’");
	const nfdCurly = nfd.replace(/'/g, "’");
	return [amPm, nfd, curly, nfdCurly].find((variant) => variant !== resolved && fs.existsSync(variant)) ?? resolved;
}

/** Real path, or null when the file does not exist. */
export function realPath(filePath: string): string | null {
	try {
		return fs.realpathSync(filePath);
	} catch {
		return null;
	}
}

/** Path of `absolutePath` relative to `root`, with `/` separators. Null if it is not inside `root`. */
export function relativeInside(absolutePath: string, root: string): string | null {
	const relative = path.relative(root, absolutePath);
	if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
		return null;
	}
	return relative.split(path.sep).join("/");
}
