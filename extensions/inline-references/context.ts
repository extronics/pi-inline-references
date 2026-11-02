/**
 * The files that the model context has already: files that a `read` call returned completely,
 * and files that this extension included. Their content is not injected again.
 */

import { realPath, relativeInside, resolveReadPath } from "./paths.ts";
import { includedFilesIn } from "./resolve.ts";

interface ReadCall {
	path?: unknown;
	offset?: unknown;
	limit?: unknown;
}

/**
 * Project-relative path of the file of a `read` call that returned the complete file. Null for
 * partial or truncated reads, and for files outside the project.
 */
export function completelyReadFile(args: ReadCall, details: unknown, cwd: string, projectRoot: string): string | null {
	if (typeof args.path !== "string" || args.offset !== undefined || args.limit !== undefined) return null;
	if ((details as { truncation?: { truncated?: boolean } } | undefined)?.truncation?.truncated) return null;
	const real = realPath(resolveReadPath(args.path, cwd));
	return real ? relativeInside(real, projectRoot) : null;
}

/** Project-relative paths of the files that `messages` (the model context) contain. */
export function filesInMessages(messages: readonly unknown[], cwd: string, projectRoot: string): Set<string> {
	const files = new Set<string>();
	const readCalls = new Map<string, ReadCall>();
	for (const message of messages) {
		const { role, content, toolCallId, toolName, isError, details } = (message ?? {}) as {
			role?: string;
			content?: unknown;
			toolCallId?: string;
			toolName?: string;
			isError?: boolean;
			details?: unknown;
		};
		if (!Array.isArray(content)) continue;
		if (role === "assistant") {
			for (const block of content) {
				if (block?.type === "toolCall" && block.name === "read") readCalls.set(block.id, block.arguments ?? {});
			}
		} else if (role === "toolResult") {
			for (const block of content) {
				if (block?.type === "text" && typeof block.text === "string") {
					for (const file of includedFilesIn(block.text)) files.add(file);
				}
			}
			const call = toolName === "read" && !isError && toolCallId ? readCalls.get(toolCallId) : undefined;
			const file = call ? completelyReadFile(call, details, cwd, projectRoot) : null;
			if (file) files.add(file);
		}
	}
	return files;
}
