import { afterEach, beforeEach, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import extension from "../extensions/inline-references/index.ts";

type Handler = (event: any, ctx: any) => Promise<any>;

let root: string;
let handler: Handler;

function write(relativePath: string, content: string) {
	const file = path.join(root, relativePath);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, content);
}

function readResult(filePath: string, text: string, toolName = "read") {
	const event = { type: "tool_result", toolName, toolCallId: "1", input: { path: filePath }, content: [{ type: "text", text }], isError: false };
	return handler(event, { cwd: root });
}

beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "inline-references-ext-"));
	extension({ on: (_name: string, h: Handler) => (handler = h) } as never);
	write("docs/details.md", "Details.");
});

afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

// Known defect: REF_PATTERN keeps `lastIndex` after `.test()`, so `matchAll()` skips the first
// reference. Change to `test()` when the defect is fixed.
test.failing("replaces the result of a Markdown read, relative to the directory of the file", async () => {
	const result = await readResult("docs/index.md", "See @details.md");

	expect(result.content).toHaveLength(1);
	expect(result.content[0].text).toContain("<!-- inline reference injected from details.md -->\n");
	expect(result.content[0].text).toContain("Details.");
});

test("does not change results of other tools, other files or files without references", async () => {
	expect(await readResult("docs/index.md", "See @details.md", "grep")).toBeUndefined();
	expect(await readResult("docs/index.ts", "See @details.md")).toBeUndefined();
	expect(await readResult("docs/index.md", "No references.")).toBeUndefined();
});
