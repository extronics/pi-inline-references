import { afterEach, beforeEach, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { MAX_DEPTH, resolveContent } from "../extensions/inline-references/resolve.ts";

let root: string;

function write(relativePath: string, content: string) {
	const file = path.join(root, relativePath);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, content);
}

function resolve(content: string, baseDir = root) {
	return resolveContent(content, baseDir, 0, new Set());
}

/** Anchor IDs in the order of their headings. */
function anchors(text: string): string[] {
	return [...text.matchAll(/^#### (reference-[0-9a-f]{12})$/gm)].map((match) => match[1]);
}

beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "inline-references-"));
});

afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

test("replaces a reference with a link and appends the referenced file", async () => {
	write("docs/details.md", "Details.");
	const result = await resolve("See @docs/details.md for more.");
	const [anchor] = anchors(result);

	expect(result).toBe(
		`See [docs/details.md](#${anchor}) for more.\n\n` +
			`<!-- inline reference injected from docs/details.md -->\n#### ${anchor}\nDetails.`
	);
});

test("injects a file one time when the content references it two times", async () => {
	write("a.md", "A.");
	const result = await resolve("@a.md and @a.md");

	expect(anchors(result)).toHaveLength(1);
	expect(result.startsWith(`[a.md](#${anchors(result)[0]}) and [a.md](#${anchors(result)[0]})`)).toBe(true);
});

test("resolves nested references relative to the referencing file", async () => {
	write("docs/a.md", "A uses @sub/b.md");
	write("docs/sub/b.md", "B.");
	const result = await resolve("@docs/a.md");

	expect(result).toContain("<!-- inline reference injected from sub/b.md -->");
	expect(result).toContain("B.");
});

test("does not inject a file again inside its own chain", async () => {
	write("a.md", "A links @b.md");
	write("b.md", "B links @a.md");
	const result = await resolve("@a.md", root);

	expect(result.match(/injected from a\.md/g)).toHaveLength(1);
	expect(result.match(/injected from b\.md/g)).toHaveLength(1);
});

test(`stops at a depth of ${MAX_DEPTH}`, async () => {
	write("1.md", "One @2.md");
	write("2.md", "Two @3.md");
	write("3.md", "Three @4.md");
	write("4.md", "Four.");
	const result = await resolve("@1.md");

	expect(result).toContain("Three @4.md");
	expect(result).not.toContain("Four.");
});

test("marks a reference that it cannot read", async () => {
	const result = await resolve("See @missing.md");

	expect(result).toContain("<!-- inline reference injection failed for missing.md -->");
});

test("ignores `@` inside words and paths that do not end in .md", async () => {
	expect(await resolve("mail user@example.md or @notes.txt")).toBe("mail user@example.md or @notes.txt");
});
