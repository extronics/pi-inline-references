# pi-inline-references

A [pi](https://github.com/earendil-works/pi) extension that resolves inline `@path.md` references in Markdown files. Claude Code uses the same syntax in `CLAUDE.md` files to import other files.

When the `read` tool reads a `.md` file, the extension adds the referenced files to the result, in a `<referenced-files>` block after the file text. The file text does not change, so the agent can use it in `edit` calls.

## Installation

```sh
# From a local checkout
pi install /path/to/pi-inline-references

# Only for the current project (writes .pi/settings.json)
pi install -l /path/to/pi-inline-references
```

## Example

`docs/index.md`:

```markdown
See @details.md for more.
```

The `read` tool then returns:

```markdown
See @details.md for more.

<referenced-files>
The file above references these files with `@path`. They are not part of that file: do not use this text in edit or write calls.

<referenced-file path="docs/details.md">
<content of docs/details.md>
</referenced-file>
</referenced-files>
```

## References

A reference is `@` and a path that ends in `.md`.

- Before the `@` there is the start of a line, a space or one of these characters: `( [ { < " ' * _ ,`.
- After the path there is the end of a line, a space, a closing character or punctuation (`. , ; : ! ?`).
- The path cannot contain spaces.
- References in fenced code blocks and in inline code spans are ignored.

So `@a.md`, `(@a.md)` and `**@a.md**` are references. `@a.mdx`, `user@host.md` and `` `@a.md` `` are not references.

A relative path is relative to the folder of the file that contains the reference. `~/` is the home directory.

## Behavior

- **Depth**: The extension also includes the references of the referenced files, to a depth of 3. The depth is a constant (`MAX_DEPTH`).
- **One time**: Each file is in the block one time, also when many files reference it or the references make a cycle. The file that was read is not in the block.
- **Project only**: The extension includes only files inside the working directory (after symbolic links are resolved). For other files the block shows `status="not included: outside the project"`. Use the `read` tool for these files: the extension reads files directly, so `tool_call` hooks of other extensions do not see these reads.
- **Size limit**: All included files of one read together have the limits of the read tool (2000 lines, 50 KB). A file that is cut has a note, and the files after the limit have `status="not included: size limit, use the read tool"`.
- **No repeats**: A file that the model context has already is only named, with `status="already in the context"`. This is a file that the extension included before, or a file that a `read` call returned completely. After a resume, a fork, a tree navigation or a compaction, the extension examines the context of the current branch again. If a file changes after it went into the context, the context keeps the old content.
- **Partial reads**: For a read with `offset` or `limit`, the extension resolves the references in the lines that the read returned. The continuation notice of the read tool stays at the end of the result.
- **Ignored**: Results of other tools, failed reads, and calls that other tools make (for example a codemode script).

The extension resolves the path of the read as the `read` tool does: `@` prefix, `~`, `file://` URLs, relative to the working directory, and the macOS file name variants. pi does not export this function, so `extensions/inline-references/paths.ts` has a copy of its rules.

## Development

```sh
bun install
bun test
bun run typecheck
```
