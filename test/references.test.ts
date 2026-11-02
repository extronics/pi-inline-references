import { expect, test } from "bun:test";
import { findReferences } from "../extensions/inline-references/references.ts";

test("finds references after spaces, line starts and opening characters", () => {
	expect(findReferences("@a.md see @b.md (@c.md) [@d.md] **@e.md** \"@f.md\"")).toEqual(["a.md", "b.md", "c.md", "d.md", "e.md", "f.md"]);
});

test("finds each path one time, in the order of its first use", () => {
	expect(findReferences("@b.md @a.md @b.md")).toEqual(["b.md", "a.md"]);
});

test("ends a reference at punctuation", () => {
	expect(findReferences("Read @a.md. Then @b.md, @c.md; and @d.md: @e.md,@f.md")).toEqual(["a.md", "b.md", "c.md", "d.md", "e.md", "f.md"]);
});

test("accepts relative, parent, absolute and home paths", () => {
	expect(findReferences("@./a.md @../b.md @/abs/c.md @~/d.md")).toEqual(["./a.md", "../b.md", "/abs/c.md", "~/d.md"]);
});

test("ignores other file types, `@` in words and paths that continue after .md", () => {
	expect(findReferences("@a.mdx user@host.md @notes.txt @a.md/b @a.md.bak")).toEqual([]);
});

test("ignores references in code", () => {
	const text = ["Use `@a.md` in text.", "```markdown", "@b.md", "```", "~~~", "@c.md", "~~~", "But @d.md here."].join("\n");
	expect(findReferences(text)).toEqual(["d.md"]);
});

test("gives the same result for the same text in each call", () => {
	expect(findReferences("See @a.md")).toEqual(["a.md"]);
	expect(findReferences("See @a.md")).toEqual(["a.md"]);
});
