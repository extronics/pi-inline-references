/**
 * Collection of the files that a Markdown file references, and the text block for the model.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { truncateHead } from "@earendil-works/pi-coding-agent";
import { realPath, relativeInside, resolveFilePath } from "./paths.ts";
import { findReferences } from "./references.ts";

export interface ResolveOptions {
	/** Real path of the project root. Only files inside it are included. */
	projectRoot: string;
	/** Levels of references to follow. 1: only the references of the file that was read. */
	maxDepth: number;
	/** Limits for the content of all included files of one read together. */
	maxBytes: number;
	maxLines: number;
	/** Project-relative paths of the files that the model context has already. */
	inContext: ReadonlySet<string>;
}

export type ReferencedFile =
	| { path: string; status: "included"; content: string; note?: string }
	| { path: string; status: "in-context" | "outside-project" | "not-found" | "not-a-file" | "size-limit" };

const STATUS_TEXT: Record<Exclude<ReferencedFile["status"], "included">, string> = {
	"in-context": "already in the context",
	"outside-project": "not included: outside the project",
	"not-found": "not included: file not found",
	"not-a-file": "not included: not a regular file",
	"size-limit": "not included: size limit, use the read tool",
};

/**
 * The files that `text` (the content of `file`) references, breadth first. Each file is in the
 * result one time, also when it is referenced from many files or in a cycle. `file` itself is
 * never in the result.
 */
export function collectReferencedFiles(file: string, text: string, options: ResolveOptions): ReferencedFile[] {
	const result: ReferencedFile[] = [];
	const seen = new Set<string>([realPath(file) ?? file]);
	let bytesLeft = options.maxBytes;
	let linesLeft = options.maxLines;
	let queue = findReferences(text).map((reference) => ({ reference, dir: path.dirname(file) }));

	for (let depth = 1; depth <= options.maxDepth && queue.length > 0; depth++) {
		const next: typeof queue = [];
		for (const { reference, dir } of queue) {
			const absolute = resolveFilePath(reference, dir);
			const real = realPath(absolute);
			if (real && seen.has(real)) continue;
			if (real) seen.add(real);
			const projectPath = real ? relativeInside(real, options.projectRoot) : relativeInside(absolute, options.projectRoot);
			const displayPath = projectPath ?? absolute;

			if (!projectPath) {
				result.push({ path: displayPath, status: "outside-project" });
				continue;
			}
			if (!real) {
				result.push({ path: displayPath, status: "not-found" });
				continue;
			}
			if (!fs.statSync(real).isFile()) {
				result.push({ path: displayPath, status: "not-a-file" });
				continue;
			}
			if (options.inContext.has(projectPath)) {
				result.push({ path: displayPath, status: "in-context" });
				continue;
			}
			if (bytesLeft <= 0 || linesLeft <= 0) {
				result.push({ path: displayPath, status: "size-limit" });
				continue;
			}

			const truncation = truncateHead(fs.readFileSync(real, "utf8"), { maxBytes: bytesLeft, maxLines: linesLeft });
			if (truncation.outputLines === 0 && truncation.truncated) {
				result.push({ path: displayPath, status: "size-limit" });
				continue;
			}
			bytesLeft -= truncation.outputBytes;
			linesLeft -= truncation.outputLines;
			result.push({
				path: displayPath,
				status: "included",
				content: truncation.content.replace(/\s+$/, ""),
				note: truncation.truncated
					? `[Shows ${truncation.outputLines} of ${truncation.totalLines} lines (size limit). Use the read tool on ${displayPath} to see the rest.]`
					: undefined,
			});
			for (const reference of findReferences(truncation.content)) next.push({ reference, dir: path.dirname(real) });
		}
		queue = next;
	}
	return result;
}

/** Text block for the model. It tells that the files are not part of the file that was read. */
export function formatReferencedFiles(files: ReferencedFile[]): string {
	const parts = files.map((file) => {
		if (file.status !== "included") return `<referenced-file path="${file.path}" status="${STATUS_TEXT[file.status]}" />`;
		const note = file.note ? `\n${file.note}` : "";
		return `<referenced-file path="${file.path}">\n${file.content}${note}\n</referenced-file>`;
	});
	return (
		"<referenced-files>\n" +
		"The file above references these files with `@path`. They are not part of that file: do not use this text in edit or write calls.\n\n" +
		parts.join("\n\n") +
		"\n</referenced-files>"
	);
}

const INCLUDED_MARKER = /^<referenced-file path="([^"]+)">$/gm;

/** Project-relative paths of the files that `text` includes in `<referenced-file>` elements. */
export function includedFilesIn(text: string): string[] {
	return [...text.matchAll(INCLUDED_MARKER)].map((match) => match[1]);
}
