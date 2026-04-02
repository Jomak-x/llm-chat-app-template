import {
	DurableObject,
	WorkflowEntrypoint,
	type WorkflowEvent,
	type WorkflowStep,
} from "cloudflare:workers";
import {
	buildChatMessages,
	CHAT_MODEL,
	generateLaunchArtifacts,
} from "./ai";
import {
	extractUrlsFromText,
	normalizeCompetitorUrls,
	researchCompetitors,
	stripUrlsFromText,
	suggestCompetitorUrlsFromIdea,
} from "./research";
import {
	appendAssistantMessage,
	appendUserMessage,
	completeWorkflow,
	createDefaultState,
	deriveSnapshotFromConversation,
	failWorkflow,
	markWorkflowRunning,
	mergeSnapshot,
	setCompetitorUrls,
	resetState,
	STATE_KEY,
	updateResearchProgress,
} from "./state";
import {
	CompetitorResearchResult,
	Env,
	LaunchArtifacts,
	LaunchWorkflowParams,
	ProjectState,
	SnapshotExtraction,
} from "./types";

const encoder = new TextEncoder();

export default {
	async fetch(
		request: Request,
		env: Env,
	): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
			return env.ASSETS.fetch(request);
		}

		if (url.pathname === "/api/state" && request.method === "GET") {
			return handleStateRequest(url, env);
		}

		if (url.pathname === "/api/chat" && request.method === "POST") {
			return handleChatRequest(request, env);
		}

		if (url.pathname === "/api/competitors" && request.method === "POST") {
			return handleCompetitorsRequest(request, env);
		}

		if (
			(url.pathname === "/api/run-analysis" ||
				url.pathname === "/api/generate-brief") &&
			request.method === "POST"
		) {
			return handleRunAnalysisRequest(request, env);
		}

		if (url.pathname === "/api/reset" && request.method === "POST") {
			return handleResetRequest(request, env);
		}

		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

export class LaunchSessionDurableObject extends DurableObject<Env> {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/state" && request.method === "GET") {
			return jsonResponse(await this.readState());
		}

		if (url.pathname === "/turn/start" && request.method === "POST") {
			const body = (await request.json()) as { message?: string };
			const nextState = appendUserMessage(await this.readState(), body.message ?? "");
			return jsonResponse(await this.writeState(nextState));
		}

		if (url.pathname === "/turn/complete" && request.method === "POST") {
			const body = (await request.json()) as { assistantMessage?: string };
			const nextState = appendAssistantMessage(
				await this.readState(),
				body.assistantMessage ?? "",
			);
			return jsonResponse(await this.writeState(nextState));
		}

		if (url.pathname === "/snapshot/merge" && request.method === "POST") {
			const body = (await request.json()) as { snapshot?: SnapshotExtraction };
			const nextState = mergeSnapshot(
				await this.readState(),
				body.snapshot ?? {
					ideaName: "",
					oneLiner: "",
					targetUser: "",
					problem: "",
					solution: "",
					keyFeatures: [],
					mvpScope: [],
					risks: [],
					openQuestions: [],
				},
			);
			return jsonResponse(await this.writeState(nextState));
		}

		if (url.pathname === "/competitors" && request.method === "POST") {
			const body = (await request.json()) as { urls?: string[] };
			const nextState = setCompetitorUrls(await this.readState(), body.urls ?? []);
			return jsonResponse(await this.writeState(nextState));
		}

		if (url.pathname === "/workflow/start" && request.method === "POST") {
			const body = (await request.json()) as { workflowId?: string };
			const workflowId = body.workflowId?.trim() ?? "";
			if (!workflowId) {
				return jsonResponse({ error: "workflowId is required." }, { status: 400 });
			}

			const nextState = markWorkflowRunning(await this.readState(), workflowId);
			return jsonResponse(await this.writeState(nextState));
		}

		if (url.pathname === "/research/update" && request.method === "POST") {
			const body = (await request.json()) as {
				stage?: ProjectState["researchStatus"]["stage"];
				profiles?: CompetitorResearchResult["profiles"];
				errors?: string[];
			};
			const nextState = updateResearchProgress(await this.readState(), {
				stage: body.stage,
				profiles: body.profiles,
				errors: body.errors,
			});
			return jsonResponse(await this.writeState(nextState));
		}

		if (url.pathname === "/workflow/complete" && request.method === "POST") {
			const body = (await request.json()) as {
				workflowId?: string;
				sourceRevision?: number;
				artifacts?: LaunchArtifacts;
			};

			const nextState = completeWorkflow(
				await this.readState(),
				body.workflowId ?? "",
				body.sourceRevision ?? -1,
				body.artifacts ?? {
					competitorResearch: [],
					marketInsights: [],
					recommendedWedge: "",
					differentiation: {
						headline: "",
						whyItWins: "",
						messagingPillars: [],
					},
					researchErrors: [],
					launchBrief: {
						summary: "",
						audience: "",
						valueProposition: "",
						launchStrategy: "",
						successMetric: "",
					},
					checklist: [],
					validationPlan: [],
					customerQuestions: [],
					outreachMessage: "",
					decisionBoard: {
						buildNow: [],
						avoidNow: [],
						proofPoints: [],
						firstSalesMotion: "",
					},
					messagingKit: {
						homepageHeadline: "",
						homepageSubheadline: "",
						elevatorPitch: "",
						demoOpener: "",
					},
					cloudflarePlan: {
						summary: "",
						architecture: "",
						services: [],
						launchSequence: [],
						edgeAdvantage: "",
					},
					implementationKit: {
						productSpec: "",
						codingPrompt: "",
						agentPrompt: "",
						starterTasks: [],
					},
					pitchDeck: [],
					forecast: [],
					websitePrototype: {
						title: "",
						summary: "",
						html: "",
					},
				},
			);
			return jsonResponse(await this.writeState(nextState));
		}

		if (url.pathname === "/workflow/error" && request.method === "POST") {
			const body = (await request.json()) as {
				workflowId?: string;
				sourceRevision?: number;
				error?: string;
			};

			const nextState = failWorkflow(
				await this.readState(),
				body.workflowId ?? "",
				body.sourceRevision ?? -1,
				body.error ?? "The launch brief workflow failed.",
			);
			return jsonResponse(await this.writeState(nextState));
		}

		if (url.pathname === "/reset" && request.method === "POST") {
			return jsonResponse(await this.writeState(resetState()));
		}

		return new Response("Not found", { status: 404 });
	}

	private async readState(): Promise<ProjectState> {
		const savedState = await this.ctx.storage.get<ProjectState>(STATE_KEY);
		if (savedState) {
			return savedState;
		}

		const nextState = createDefaultState();
		await this.ctx.storage.put(STATE_KEY, nextState);
		return nextState;
	}

	private async writeState(state: ProjectState): Promise<ProjectState> {
		await this.ctx.storage.put(STATE_KEY, state);
		return state;
	}
}

export class LaunchBriefWorkflow extends WorkflowEntrypoint<
	Env,
	LaunchWorkflowParams
> {
	async run(
		event: Readonly<WorkflowEvent<LaunchWorkflowParams>>,
		step: WorkflowStep,
	): Promise<LaunchArtifacts> {
		try {
			await step.do("mark-researching", async () => {
				await callSession<ProjectState>(
					this.env,
					event.payload.sessionId,
					"/research/update",
					{
						method: "POST",
						body: JSON.stringify({
							stage:
								event.payload.projectState.competitorUrls.length > 0
									? "researching"
									: "synthesizing",
						}),
					},
				);

				return { saved: true };
			});

			const research = await step.do(
				"research-competitors",
				{
					retries: {
						limit: 2,
						delay: "10 seconds",
						backoff: "linear",
					},
					timeout: "45 seconds",
				},
				() => researchCompetitors(event.payload.projectState.competitorUrls),
			);

			await step.do("persist-competitor-research", async () => {
				await callSession<ProjectState>(
					this.env,
					event.payload.sessionId,
					"/research/update",
					{
						method: "POST",
						body: JSON.stringify({
							stage: "synthesizing",
							profiles: research.profiles,
							errors: research.errors,
						}),
					},
				);

				return { saved: true };
			});

			const artifacts = await step.do(
				"generate-market-analysis",
				{
					retries: {
						limit: 2,
						delay: "8 seconds",
						backoff: "linear",
					},
					timeout: "90 seconds",
				},
				() =>
					generateLaunchArtifacts(
						this.env,
						event.payload.projectState,
						research,
					),
			);

			await step.do("persist-market-artifacts", async () => {
				await callSession<ProjectState>(
					this.env,
					event.payload.sessionId,
					"/workflow/complete",
					{
						method: "POST",
						body: JSON.stringify({
							workflowId: event.payload.workflowId,
							sourceRevision: event.payload.sourceRevision,
							artifacts,
						}),
					},
				);

				return { saved: true };
			});

			return artifacts;
		} catch (error) {
			await callSession<ProjectState>(
				this.env,
				event.payload.sessionId,
				"/workflow/error",
				{
					method: "POST",
					body: JSON.stringify({
						workflowId: event.payload.workflowId,
						sourceRevision: event.payload.sourceRevision,
						error: getErrorMessage(error),
					}),
				},
			);

			throw error;
		}
	}
}

async function handleStateRequest(url: URL, env: Env): Promise<Response> {
	const sessionId = normalizeSessionId(url.searchParams.get("sessionId"));
	if (!sessionId) {
		return badRequest("A valid sessionId is required.");
	}

	return jsonResponse(await callSession<ProjectState>(env, sessionId, "/state"));
}

async function handleResetRequest(request: Request, env: Env): Promise<Response> {
	const body = (await request.json()) as { sessionId?: string };
	const sessionId = normalizeSessionId(body.sessionId);
	if (!sessionId) {
		return badRequest("A valid sessionId is required.");
	}

	const state = await callSession<ProjectState>(env, sessionId, "/reset", {
		method: "POST",
	});
	return jsonResponse(state);
}

async function handleCompetitorsRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	const body = (await request.json()) as { sessionId?: string; urls?: string[] };
	const sessionId = normalizeSessionId(body.sessionId);
	if (!sessionId) {
		return badRequest("A valid sessionId is required.");
	}

	const urls = normalizeCompetitorUrls(body.urls ?? []);
	const state = await callSession<ProjectState>(env, sessionId, "/competitors", {
		method: "POST",
		body: JSON.stringify({ urls }),
	});
	return jsonResponse(state);
}

async function handleRunAnalysisRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	const body = (await request.json()) as { sessionId?: string };
	const sessionId = normalizeSessionId(body.sessionId);
	if (!sessionId) {
		return badRequest("A valid sessionId is required.");
	}

	const currentState = await callSession<ProjectState>(env, sessionId, "/state");
	if (!currentState.messages.some((message) => message.role === "user")) {
		return badRequest("Add at least one product idea message before running analysis.");
	}

	if (currentState.workflowStatus.status === "running") {
		return jsonResponse(
			{ error: "An analysis workflow is already running for this session." },
			{ status: 409 },
		);
	}

	const workflowId = `analysis-${sessionId}-${Date.now()}`;
	const state = await callSession<ProjectState>(env, sessionId, "/workflow/start", {
		method: "POST",
		body: JSON.stringify({ workflowId }),
	});

	try {
		const instance = await env.LAUNCH_BRIEF_WORKFLOW.create({
			id: workflowId,
			params: {
				sessionId,
				workflowId,
				sourceRevision: state.workflowStatus.sourceRevision ?? state.revision,
				projectState: state,
			},
		});

		return jsonResponse({
			workflowId: instance.id,
			status: state.workflowStatus.status,
		});
	} catch (error) {
		await callSession<ProjectState>(env, sessionId, "/workflow/error", {
			method: "POST",
			body: JSON.stringify({
				workflowId,
				sourceRevision: state.workflowStatus.sourceRevision ?? state.revision,
				error: getErrorMessage(error),
			}),
		});

		return jsonResponse(
			{ error: "Failed to start the market-analysis workflow." },
			{ status: 500 },
		);
	}
}

async function handleChatRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	const body = (await request.json()) as {
		sessionId?: string;
		message?: string;
	};

	const sessionId = normalizeSessionId(body.sessionId);
	const rawMessage = body.message?.trim() ?? "";
	const explicitUrls = extractUrlsFromText(rawMessage);
	const message = stripUrlsFromText(rawMessage);

	if (!sessionId) {
		return badRequest("A valid sessionId is required.");
	}

	if (!message) {
		return badRequest("Describe the idea you want analyzed.");
	}

	let state = await callSession<ProjectState>(env, sessionId, "/turn/start", {
		method: "POST",
		body: JSON.stringify({ message }),
	});

	if (explicitUrls.length > 0) {
		state = await callSession<ProjectState>(env, sessionId, "/competitors", {
			method: "POST",
			body: JSON.stringify({
				urls: normalizeCompetitorUrls([...state.competitorUrls, ...explicitUrls]),
			}),
		});
	}

	let modelStream: ReadableStream | null = null;

	try {
		modelStream = (await env.AI.run(CHAT_MODEL, {
			messages: buildChatMessages(state),
			max_tokens: 768,
			stream: true,
		})) as ReadableStream;
	} catch (error) {
		console.error("Failed to start Workers AI stream:", error);
		return jsonResponse(
			{ error: "Failed to start the chat response." },
			{ status: 500 },
		);
	}

	let assistantMessage = "";

	const stream = new ReadableStream({
		async start(controller) {
			try {
				assistantMessage = await relayModelStream(modelStream!, controller);
			} catch (error) {
				console.error("Streaming response failed:", error);
				const fallbackMessage =
					assistantMessage.length > 0
						? "\n\nThe response was interrupted, but I kept your progress."
						: "I hit a temporary issue while generating the response. Please try again.";
				controller.enqueue(formatSseChunk(fallbackMessage));
				assistantMessage += fallbackMessage;
			} finally {
				if (assistantMessage.trim()) {
					const finalizedState = await finalizeChatTurn(
						env,
						sessionId,
						assistantMessage,
					);
					controller.enqueue(formatSseEvent({ state: finalizedState }));
				}
				controller.enqueue(encoder.encode("data: [DONE]\n\n"));
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			"content-type": "text/event-stream; charset=utf-8",
			"cache-control": "no-cache",
			connection: "keep-alive",
		},
	});
}

async function finalizeChatTurn(
	env: Env,
	sessionId: string,
	assistantMessage: string,
): Promise<ProjectState> {
	try {
		const state = await callSession<ProjectState>(env, sessionId, "/turn/complete", {
			method: "POST",
			body: JSON.stringify({ assistantMessage }),
		});
		const snapshot = deriveSnapshotFromConversation(state);
		let mergedState = await callSession<ProjectState>(env, sessionId, "/snapshot/merge", {
			method: "POST",
			body: JSON.stringify({ snapshot }),
		});

		if (mergedState.competitorUrls.length === 0) {
			const suggestedUrls = suggestCompetitorUrlsFromIdea(
				[
					mergedState.ideaName,
					mergedState.oneLiner,
					mergedState.problem,
					...mergedState.messages
						.filter((message) => message.role === "user")
						.map((message) => message.content),
				]
					.filter(Boolean)
					.join(". "),
			);

			if (suggestedUrls.length > 0) {
				mergedState = await callSession<ProjectState>(env, sessionId, "/competitors", {
					method: "POST",
					body: JSON.stringify({
						urls: normalizeCompetitorUrls([
							...mergedState.competitorUrls,
							...suggestedUrls,
						]),
					}),
				});
			}
		}

		return mergedState;
	} catch (error) {
		console.error("Failed to finalize the chat turn:", error);
		return callSession<ProjectState>(env, sessionId, "/state");
	}
}

async function relayModelStream(
	stream: ReadableStream,
	controller: ReadableStreamDefaultController<Uint8Array>,
): Promise<string> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let assistantMessage = "";
	let buffer = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			const parsed = consumeSseEvents(buffer + "\n\n");
			for (const data of parsed.events) {
				const chunk = extractContentChunk(data);
				if (!chunk) continue;
				assistantMessage += chunk;
				controller.enqueue(formatSseChunk(chunk));
			}
			break;
		}

		buffer += decoder.decode(value, { stream: true });
		const parsed = consumeSseEvents(buffer);
		buffer = parsed.buffer;

		for (const data of parsed.events) {
			if (data === "[DONE]") {
				return assistantMessage;
			}

			const chunk = extractContentChunk(data);
			if (!chunk) continue;
			assistantMessage += chunk;
			controller.enqueue(formatSseChunk(chunk));
		}
	}

	return assistantMessage;
}

function extractContentChunk(data: string): string {
	try {
		const parsed = JSON.parse(data) as {
			response?: string;
			choices?: Array<{ delta?: { content?: string } }>;
		};
		if (typeof parsed.response === "string") {
			return parsed.response;
		}
		if (typeof parsed.choices?.[0]?.delta?.content === "string") {
			return parsed.choices[0].delta.content;
		}
		return "";
	} catch {
		return "";
	}
}

function consumeSseEvents(buffer: string): {
	events: string[];
	buffer: string;
} {
	let normalized = buffer.replace(/\r/g, "");
	const events: string[] = [];
	let eventBoundary = normalized.indexOf("\n\n");

	while (eventBoundary !== -1) {
		const rawEvent = normalized.slice(0, eventBoundary);
		normalized = normalized.slice(eventBoundary + 2);

		const lines = rawEvent.split("\n");
		const dataLines = lines
			.filter((line) => line.startsWith("data:"))
			.map((line) => line.slice("data:".length).trimStart());

		if (dataLines.length > 0) {
			events.push(dataLines.join("\n"));
		}

		eventBoundary = normalized.indexOf("\n\n");
	}

	return { events, buffer: normalized };
}

function normalizeSessionId(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}

	const normalized = value.trim();
	if (!/^[a-zA-Z0-9_-]{8,120}$/.test(normalized)) {
		return null;
	}

	return normalized;
}

function formatSseChunk(content: string): Uint8Array {
	return encoder.encode(`data: ${JSON.stringify({ response: content })}\n\n`);
}

function formatSseEvent(payload: unknown): Uint8Array {
	return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function jsonResponse(data: unknown, init?: ResponseInit): Response {
	return new Response(JSON.stringify(data), {
		...init,
		headers: {
			"content-type": "application/json; charset=utf-8",
			...init?.headers,
		},
	});
}

function badRequest(message: string): Response {
	return jsonResponse({ error: message }, { status: 400 });
}

function getSessionStub(env: Env, sessionId: string) {
	return env.LAUNCH_SESSIONS.getByName(sessionId);
}

async function callSession<T>(
	env: Env,
	sessionId: string,
	path: string,
	init?: RequestInit,
): Promise<T> {
	const response = await getSessionStub(env, sessionId).fetch(
		new Request(`https://launch-session${path}`, init),
	);

	if (!response.ok) {
		const message = await response.text();
		throw new Error(`Session request failed: ${response.status} ${message}`);
	}

	return (await response.json()) as T;
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}
	return "Unknown error";
}
