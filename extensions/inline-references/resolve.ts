/**
 * Resolution of inline `@path.md` references. No pi API: the extension entry
 * point (`index.ts`) calls `resolveContent()` for `read` tool results.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

/** Maximum recursion depth for inline reference resolution. */
export const MAX_DEPTH = 3;

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/**
 * Regex to match inline @path.md references.
 * Matches `@` followed by a path ending in `.md`, at a word boundary.
 */
export const REF_PATTERN = /(?<!\S)@([^\s]+\.md)/g;

// -----------------------------------------------------------------------------
// Resolution
// -----------------------------------------------------------------------------

/**
 * Recursively resolve inline @path references in markdown content.
 *
 * @param content - The markdown content to process.
 * @param baseDir - Directory to resolve relative paths against.
 * @param depth - Current recursion depth.
 * @param processedPaths - Set of already-processed absolute paths (cycle detection).
 * @returns The processed content with resolved references and injected content.
 */
export async function resolveContent(
	content: string,
	baseDir: string,
	depth: number,
	processedPaths: Set<string>,
): Promise<string> {
	if (depth >= MAX_DEPTH) {
		return content;
	}

	// Find all unique references and compute anchor IDs.
	const uniqueRefs = new Map<string, string>(); // rawRef -> anchorId

	const matches = [...content.matchAll(REF_PATTERN)];
	for (const match of matches) {
		const rawRef = match[1];
		if (!rawRef || uniqueRefs.has(rawRef)) {
			continue;
		}

		const refPath = path.resolve(baseDir, rawRef);
		const anchorId = `reference-${hashPath(refPath)}`;
		uniqueRefs.set(rawRef, anchorId);
	}

	if (uniqueRefs.size === 0) {
		return content;
	}

	// Replace all @references with markdown link anchors.
	let result = content.replace(REF_PATTERN, (_match, rawRef: string) => {
		const anchorId = uniqueRefs.get(rawRef);
		return `[${rawRef}](#${anchorId})`;
	});

	// Build injections for each unique reference.
	const injections: string[] = [];
	for (const [rawRef, anchorId] of uniqueRefs) {
		const refPath = path.resolve(baseDir, rawRef);

		if (processedPaths.has(refPath)) {
			continue;
		}

		try {
			const refContent = await fs.promises.readFile(refPath, "utf-8");
			const newProcessed = new Set(processedPaths);
			newProcessed.add(refPath);

			const resolvedRefContent = await resolveContent(
				refContent,
				path.dirname(refPath),
				depth + 1,
				newProcessed,
			);

			injections.push(
				`<!-- inline reference injected from ${rawRef} -->\n` +
					`#### ${anchorId}\n` +
					`${resolvedRefContent}`,
			);
		} catch {
			// If the file can't be read, note the failure without breaking the chain.
			injections.push(
				`<!-- inline reference injection failed for ${rawRef} -->`,
			);
		}
	}

	if (injections.length > 0) {
		result += "\n\n" + injections.join("\n\n");
	}

	return result;
}

/**
 * Generate a short hash from a file path for use as an anchor ID.
 */
function hashPath(filePath: string): string {
	return createHash("sha256").update(filePath).digest("hex").slice(0, 12);
}
