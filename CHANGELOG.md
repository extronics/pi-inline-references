# Changelog

## 0.1.0 (unreleased)

- First version, extracted from a project extension (`.pi/extensions/inline-references.ts`).
- Fix: the extension resolved no reference in most reads, because a shared global RegExp kept its `lastIndex` between calls.
- Keep the file text unchanged. Add the referenced files in a `<referenced-files>` block after the text, before the continuation notice of the read tool.
- Include each file one time for each read, and do not include files that the model context has already.
- Include only files inside the project, and apply the size limits of the read tool.
- Ignore references in code, `@a.mdx` and similar paths. Find references after `(`, `*` and other opening characters.
- Resolve the read path like the read tool. Ignore failed reads and nested calls, and keep the structured content.
