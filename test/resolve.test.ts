import { afterEach, beforeEach, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { collectReferencedFiles, formatReferencedFiles, includedFilesIn, type ResolveOptions } from "../extensions/inline-references/resolve.ts";

let base: string;
let root: string;

function write(relativePath: string, content: string) {
	const file = path.join(root, relativePath);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, content);
}

function collect(relativePath: string, options: Partial<ResolveOptions> = {}) {
	const file = path.join(root, relativePath);
	return collectReferencedFiles(file, fs.readFileSync(file, "utf8"), {
		projectRoot: root,
		maxDepth: 3,
		maxBytes: 50 * 1024,
		maxLines: 2000,
		inContext: new Set(),
		...options,
	});
}

function summary(relativePath: string, options: Partial<ResolveOptions> = {}) {
	return collect(relativePath, options).map((file) => `${file.path}:${file.status}`);
}

beforeEach(() => {
	base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "inline-references-")));
	root = path.join(base, "project");
	fs.mkdirSync(root);
});

afterEach(() => {
	fs.rmSync(base, { recursive: true, force: true });
});

test("includes the referenced files relative to the referencing file, breadth first", () => {
	write("index.md", "See @docs/a.md and @docs/b.md");
	write("docs/a.md", "A uses @sub/c.md");
	write("docs/b.md", "B.");
	write("docs/sub/c.md", "C.");
	const files = collect("index.md");

	expect(files.map((file) => file.path)).toEqual(["docs/a.md", "docs/b.md", "docs/sub/c.md"]);
	expect(files[2]).toEqual({ path: "docs/sub/c.md", status: "included", content: "C.", note: undefined });
});

test("includes each file one time: no cycles, no repeats, not the file that was read", () => {
	write("a.md", "A links @b.md and @c.md");
	write("b.md", "B links @a.md and @d.md");
	write("c.md", "C links @d.md and @./b.md");
	write("d.md", "D links @a.md");

	expect(summary("a.md")).toEqual(["b.md:included", "c.md:included", "d.md:included"]);
});

test(`follows references to a depth of 3`, () => {
	write("0.md", "@1.md");
	write("1.md", "@2.md");
	write("2.md", "@3.md");
	write("3.md", "@4.md");
	write("4.md", "Four.");

	expect(summary("0.md")).toEqual(["1.md:included", "2.md:included", "3.md:included"]);
	expect(summary("0.md", { maxDepth: 1 })).toEqual(["1.md:included"]);
});

test("does not include files outside the project, missing files, folders and files in the context", () => {
	fs.writeFileSync(path.join(base, "secret.md"), "Secret.");
	fs.symlinkSync(path.join(base, "secret.md"), path.join(root, "link.md"));
	fs.mkdirSync(path.join(root, "folder.md"));
	write("known.md", "Known.");
	write("index.md", "@../secret.md @link.md @missing.md @folder.md @known.md");

	expect(summary("index.md", { inContext: new Set(["known.md"]) })).toEqual([
		`${base}/secret.md:outside-project`,
		"missing.md:not-found",
		"folder.md:not-a-file",
		"known.md:in-context",
	]);
});

test("shares the size limit between the files of one read", () => {
	write("index.md", "@a.md @b.md @c.md");
	write("a.md", "a1\na2\na3");
	write("b.md", "b1\nb2\nb3");
	write("c.md", "c1");
	const files = collect("index.md", { maxLines: 5 });

	expect(files.map((file) => file.status)).toEqual(["included", "included", "size-limit"]);
	expect(files[1]).toMatchObject({ content: "b1\nb2", note: "[Shows 2 of 3 lines (size limit). Use the read tool on b.md to see the rest.]" });
});

test("formats a block that tells what is not part of the file, and finds its markers again", () => {
	const text = formatReferencedFiles([
		{ path: "a.md", status: "included", content: "A." },
		{ path: "b.md", status: "in-context" },
	]);

	expect(text).toBe(
		"<referenced-files>\n" +
			"The file above references these files with `@path`. They are not part of that file: do not use this text in edit or write calls.\n\n" +
			'<referenced-file path="a.md">\nA.\n</referenced-file>\n\n' +
			'<referenced-file path="b.md" status="already in the context" />\n' +
			"</referenced-files>"
	);
	expect(includedFilesIn(text)).toEqual(["a.md"]);
});
