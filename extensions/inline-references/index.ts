/**
 * Inline Reference Resolver
 *
 * A pi extension that resolves inline `@path` references in markdown files.
 * When a markdown file is read via the `read` tool, any `@some/file.md`
 * references are replaced with markdown link anchors and the referenced
 * file's content is appended below.
 *
 * Configuration:
 *   - MAX_DEPTH: Maximum recursion depth for nested references (default: 3)
 *
 * Example:
 *   Input file content:  "See @docs/details.md for more."
 *   Output: "See [docs/details.md](#reference-a1b2c3d4e5f6) for more.
 *
 *   <!-- inline reference injected from docs/details.md -->
 *   #### reference-a1b2c3d4e5f6
 *   <content of docs/details.md>"
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as path from "node:path";
import { REF_PATTERN, resolveContent } from "./resolve.ts";

// -----------------------------------------------------------------------------
// Entry Point
// -----------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
	pi.on("tool_result", async (event, ctx) => {
		// Only process read tool results for markdown files.
		if (event.toolName !== "read") {
			return;
		}

		const filePath = event.input.path as string | undefined;
		if (!filePath || !filePath.endsWith(".md")) {
			return;
		}

		// Extract text content from the tool result.
		const textParts = event.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text);

		if (textParts.length === 0) {
			return;
		}

		const originalContent = textParts.join("");

		// Quick exit if no @ references present.
		if (!REF_PATTERN.test(originalContent)) {
			return;
		}

		// Resolve inline references.
		const baseDir = path.dirname(path.resolve(ctx.cwd, filePath));
		const resolved = await resolveContent(
			originalContent,
			baseDir,
			0,
			new Set(),
		);

		if (resolved === originalContent) {
			return;
		}

		return {
			content: [{ type: "text", text: resolved }],
		};
	});
}
