# pi-inline-references

A [pi](https://github.com/earendil-works/pi) extension that resolves inline `@path.md` references in Markdown files. Claude Code uses the same syntax in `CLAUDE.md` files to import other files.

When the `read` tool reads a `.md` file, the extension changes the result:

1. It replaces each `@path.md` reference with a Markdown link to an anchor.
2. It adds the content of each referenced file below the content, after a heading with the anchor.

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
See [details.md](#reference-a1b2c3d4e5f6) for more.

<!-- inline reference injected from details.md -->
#### reference-a1b2c3d4e5f6
<content of docs/details.md>
```

## Behavior

- A reference is an `@` after a space, a line break or the start of the text, followed by a path that ends in `.md`. The path cannot contain spaces.
- A relative path is relative to the folder of the file that contains the reference.
- The extension also resolves the references in the referenced files, to a depth of 3.
- It injects a file one time for each file that references it. It does not inject a file again in its own chain of references, so a cycle stops.
- If it cannot read a referenced file, it adds `<!-- inline reference injection failed for <path> -->`.
- The anchor is a hash of the absolute path of the referenced file.

## Development

```sh
bun install
bun test
bun run typecheck
```
