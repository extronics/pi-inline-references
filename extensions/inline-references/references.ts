/**
 * Detection of inline `@path.md` references in Markdown text.
 */

/**
 * A reference is `@` and a path that ends in `.md`. Before the `@` there is the start of a line,
 * a space or an opening character (`(`, `[`, `"`, `*`, ...). After the path there is the end of
 * a line, a space, a closing character or punctuation. So `@a.mdx`, `user@host.md` and
 * `@a.md/b` are not references.
 */
const REFERENCE_SOURCE = String.raw`(?<=^|[\s(\[{<"'*_,])@([^\s@,;()\[\]{}<>"'\x60*|]+?\.md)(?=$|[\s)\]}>"'*_,;:!?]|\.(?:\s|$))`;

/** Replace code (fenced blocks and inline code spans) with spaces. Offsets do not change. */
export function maskCode(text: string): string {
	const lines = text.split("\n");
	let fence: { char: string; length: number } | null = null;
	for (let i = 0; i < lines.length; i++) {
		const marker = /^ {0,3}(`{3,}|~{3,})/.exec(lines[i]);
		if (fence) {
			if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && /^ {0,3}[`~]+\s*$/.test(lines[i])) {
				fence = null;
			}
			lines[i] = " ".repeat(lines[i].length);
		} else if (marker) {
			fence = { char: marker[1][0], length: marker[1].length };
			lines[i] = " ".repeat(lines[i].length);
		}
	}
	return lines.join("\n").replace(/(`+)[^`][\s\S]*?\1(?!`)/g, (span) => span.replace(/[^\n]/g, " "));
}

/** The paths of the references in `text`, each one time, in the order of their first use. */
export function findReferences(text: string): string[] {
	// A new RegExp for each call: a shared global RegExp keeps `lastIndex` between calls.
	const pattern = new RegExp(REFERENCE_SOURCE, "gm");
	const paths = new Set<string>();
	for (const match of maskCode(text).matchAll(pattern)) paths.add(match[1]);
	return [...paths];
}
