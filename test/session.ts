/** A real pi session with a scripted model (faux provider), for end-to-end tests. */
import { createAgentSession, DefaultResourceLoader, type ExtensionFactory, SessionManager } from "@earendil-works/pi-coding-agent";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";

/** Run one prompt in which the model calls `read` for each path, and return the model context of the last request. */
export async function runReads(cwd: string, agentDir: string, extension: ExtensionFactory, paths: string[]) {
	let lastContext: { messages: { role: string; content: unknown }[] } | undefined;
	const faux = fauxProvider();
	faux.setResponses([
		...paths.map((path) => fauxAssistantMessage(fauxToolCall("read", { path }), { stopReason: "toolUse" })),
		(context) => {
			lastContext = context as never;
			return fauxAssistantMessage("done");
		},
	]);
	const resourceLoader = new DefaultResourceLoader({ cwd, agentDir, extensionFactories: [(pi) => pi.registerProvider(faux.provider), extension] });
	await resourceLoader.reload();
	const { session } = await createAgentSession({ cwd, agentDir, resourceLoader, sessionManager: SessionManager.inMemory(), model: faux.getModel() });
	try {
		// Emits `session_start`, as the pi CLI does.
		await session.bindExtensions({});
		await session.prompt("Read the files.");
	} finally {
		session.dispose();
	}
	const toolResults = (session.messages as { role: string; content: { type: string; text?: string }[] }[])
		.filter((message) => message.role === "toolResult")
		.map((message) => message.content.map((block) => block.text ?? "").join("\n---\n"));
	return { toolResults, modelContext: JSON.stringify(lastContext) };
}
