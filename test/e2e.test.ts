import { afterEach, beforeEach, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import extension from "../extensions/inline-references/index.ts";
import { runReads } from "./session.ts";

let root: string;
let project: string;

beforeEach(() => {
	root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "inline-references-e2e-")));
	project = path.join(root, "project");
	for (const [file, content] of Object.entries({ "docs/index.md": "See @details.md\n", "docs/details.md": "Details.\n" })) {
		fs.mkdirSync(path.dirname(path.join(project, file)), { recursive: true });
		fs.writeFileSync(path.join(project, file), content);
	}
});

afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

test("in a pi session, the model gets the referenced file one time", async () => {
	const { toolResults } = await runReads(project, path.join(root, "agent"), extension, ["docs/index.md", "docs/index.md"]);

	expect(toolResults[0]).toStartWith("See @details.md\n\n<referenced-files>\n");
	expect(toolResults[0]).toContain('<referenced-file path="docs/details.md">\nDetails.\n</referenced-file>');
	expect(toolResults[1]).toContain('<referenced-file path="docs/details.md" status="already in the context" />');
});
