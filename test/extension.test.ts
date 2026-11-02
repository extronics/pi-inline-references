import { afterEach, beforeEach, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import extension from "../extensions/inline-references/index.ts";

type Handler = (event: any, ctx: any) => Promise<any>;

let root: string;
let handlers: Record<string, Handler>;
/** Messages of the model context that the stub session manager gives. */
let contextMessages: any[];
let callId = 0;

function write(relativePath: string, content: string) {
	const file = path.join(root, relativePath);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, content);
}

function ctx() {
	return { cwd: root, sessionManager: { buildSessionProjection: () => ({ messages: contextMessages }) } };
}

/** Run the handler for a `read` call, keep the call and its result in the context and return the handler result. */
async function read(input: Record<string, unknown>, text: string, extra: Record<string, unknown> = {}) {
	const id = `call-${++callId}`;
	const event: Record<string, any> = { type: "tool_result", toolName: "read", toolCallId: id, input, content: [{ type: "text", text }], isError: false, ...extra };
	const result = await handlers.tool_result(event, ctx());
	contextMessages.push({ role: "assistant", content: [{ type: "toolCall", id, name: "read", arguments: input }] });
	contextMessages.push({ role: "toolResult", toolCallId: id, toolName: "read", content: result?.content ?? event.content, isError: false, details: event.details });
	return result;
}

async function startSession() {
	handlers = {};
	extension({ on: (name: string, handler: Handler) => (handlers[name] = handler) } as never);
	await handlers.session_start({ type: "session_start", reason: "startup" }, ctx());
}

beforeEach(async () => {
	root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "inline-references-ext-")));
	contextMessages = [];
	write("docs/details.md", "Details.");
	write("docs/index.md", "See @details.md");
	await startSession();
});

afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

test("adds the referenced files after the unchanged file text", async () => {
	const result = await read({ path: "docs/index.md" }, "See @details.md");

	expect(result.content).toHaveLength(1);
	expect(result.content[0].text).toStartWith("See @details.md\n\n<referenced-files>\n");
	expect(result.content[0].text).toContain('<referenced-file path="docs/details.md">\nDetails.\n</referenced-file>');
});

test("resolves the path of the read like the read tool", async () => {
	expect((await read({ path: "@docs/index.md" }, "See @details.md")).content[0].text).toContain("Details.");
	contextMessages = [];
	await handlers.session_tree({ type: "session_tree" }, ctx());
	expect((await read({ path: path.join(root, "docs/index.md") }, "See @details.md")).content[0].text).toContain("Details.");
});

test("keeps the continuation notice of the read tool at the end", async () => {
	const text = "See @details.md\n\n[Showing lines 1-1 of 9. Use offset=2 to continue.]";
	const result = await read({ path: "docs/index.md", limit: 1 }, text);

	expect(result.content[0].text).toStartWith("See @details.md\n\n<referenced-files>");
	expect(result.content[0].text).toEndWith("</referenced-files>\n\n[Showing lines 1-1 of 9. Use offset=2 to continue.]");
});

test("does not include a file again while the context has it", async () => {
	await read({ path: "docs/index.md" }, "See @details.md");
	const again = await read({ path: "docs/index.md" }, "See @details.md");
	expect(again.content[0].text).toContain('<referenced-file path="docs/details.md" status="already in the context" />');
	expect(again.content[0].text).not.toContain("Details.");

	// A resume finds the included file in the context.
	await startSession();
	expect((await read({ path: "docs/index.md" }, "See @details.md")).content[0].text).not.toContain("Details.");

	// Tree navigation to a point before the first read.
	contextMessages = [];
	await handlers.session_tree({ type: "session_tree" }, ctx());
	expect((await read({ path: "docs/index.md" }, "See @details.md")).content[0].text).toContain("Details.");
});

test("does not include a file that the model has read completely", async () => {
	await read({ path: "docs/details.md" }, "Details.");
	expect((await read({ path: "docs/index.md" }, "See @details.md")).content[0].text).toContain('status="already in the context"');
});

test("includes a file again after a partial read of it", async () => {
	await read({ path: "docs/details.md", offset: 1 }, "Details.");
	expect((await read({ path: "docs/index.md" }, "See @details.md")).content[0].text).toContain("Details.");
});

test("does not change other tools, other files, errors, nested calls and files without references", async () => {
	const event = (toolName: string, filePath: string, extra = {}) => ({ toolName, input: { path: filePath }, content: [{ type: "text", text: "See @details.md" }], isError: false, ...extra });
	expect(await handlers.tool_result(event("grep", "docs/index.md"), ctx())).toBeUndefined();
	expect(await handlers.tool_result(event("read", "docs/index.ts"), ctx())).toBeUndefined();
	expect(await handlers.tool_result(event("read", "docs/index.md", { isError: true }), ctx())).toBeUndefined();
	expect(await handlers.tool_result(event("read", "docs/index.md", { parentToolCallId: "p" }), ctx())).toBeUndefined();
	expect(await read({ path: "docs/details.md" }, "No references.")).toBeUndefined();
});

test("keeps the structured content and the other blocks", async () => {
	const event = {
		toolName: "read",
		input: { path: "docs/index.md" },
		content: [{ type: "text", text: "See @details.md" }, { type: "text", text: "<project-rule>" }],
		structuredContent: { text: "See @details.md" },
		isError: false,
	};
	const result = await handlers.tool_result(event, ctx());
	expect(result.structuredContent).toEqual({ text: "See @details.md" });
	expect(result.content[1]).toEqual({ type: "text", text: "<project-rule>" });
	expect(event.content[0].text).toBe("See @details.md");
});
