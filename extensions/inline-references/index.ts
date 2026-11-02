/**
 * Inline References
 *
 * When the `read` tool reads a Markdown file, this extension adds the files that the file
 * references with `@path.md` to the result, in a `<referenced-files>` block after the file text.
 * The file text itself does not change, so the model can use it for `edit` calls.
 *
 * - References resolve relative to the file that contains them, to a depth of 3.
 * - Only files inside the project (the working directory) are included.
 * - The included files of one read share the size limit of the read tool.
 * - Files that the model context has already (included or read completely before, on the
 *   current branch) are only named, not included again.
 *
 * See README.md for the details.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@earendil-works/pi-coding-agent";
import { completelyReadFile, filesInMessages } from "./context.ts";
import { realPath, resolveReadPath } from "./paths.ts";
import { collectReferencedFiles, formatReferencedFiles } from "./resolve.ts";

/** Levels of references to follow. */
export const MAX_DEPTH = 3;

/** The continuation notice that the read tool adds to the end of a partial result. */
const READ_NOTICE = /\n\n\[(?:Showing lines \d+-\d+ of \d+|\d+ more lines in file\.)[^\]\n]*\]$/;

export default function inlineReferences(pi: ExtensionAPI) {
	/** Project-relative paths of the files in the model context of the current branch. */
	let inContext = new Set<string>();

	function syncWithContext(ctx: ExtensionContext) {
		const projectRoot = realPath(ctx.cwd) ?? ctx.cwd;
		inContext = filesInMessages(ctx.sessionManager.buildSessionProjection().messages, ctx.cwd, projectRoot);
	}

	pi.on("session_start", async (_event, ctx) => syncWithContext(ctx));
	pi.on("session_tree", async (_event, ctx) => syncWithContext(ctx));
	pi.on("session_compact", async (_event, ctx) => syncWithContext(ctx));

	pi.on("tool_result", async (event, ctx) => {
		// Results of nested calls (e.g. from a codemode script) go to the calling tool, not to the agent.
		if (event.toolName !== "read" || event.isError || event.parentToolCallId) return;
		const input = event.input as { path?: unknown; offset?: unknown; limit?: unknown };
		if (typeof input.path !== "string") return;

		const projectRoot = realPath(ctx.cwd) ?? ctx.cwd;
		const readFile = completelyReadFile(input, event.details, ctx.cwd, projectRoot);
		const [first, ...rest] = event.content;
		const isMarkdown = input.path.endsWith(".md") && first?.type === "text";

		const files = isMarkdown
			? collectReferencedFiles(resolveReadPath(input.path, ctx.cwd), first.text.replace(READ_NOTICE, ""), {
					projectRoot,
					maxDepth: MAX_DEPTH,
					maxBytes: DEFAULT_MAX_BYTES,
					maxLines: DEFAULT_MAX_LINES,
					inContext,
				})
			: [];
		if (readFile) inContext.add(readFile);
		for (const file of files) if (file.status === "included") inContext.add(file.path);
		if (files.length === 0 || first?.type !== "text") return;

		// Keep the continuation notice of the read tool at the end, where the model expects it.
		const notice = READ_NOTICE.exec(first.text)?.[0] ?? "";
		const text = first.text.slice(0, first.text.length - notice.length);
		return {
			content: [{ ...first, text: `${text}${text.endsWith("\n") ? "\n" : "\n\n"}${formatReferencedFiles(files)}${notice}` }, ...rest],
			structuredContent: event.structuredContent,
		};
	});
}
