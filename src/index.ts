import {
	DurableObject,
	WorkflowEntrypoint,
	type WorkflowEvent,
	type WorkflowStep,
} from "cloudflare:workers";
import {
	CHAT_MODEL,
	buildChatMessages,
	extractConceptsAndWeakAreas,
	generateFlashcards,
	generateQuiz,
	summarizeMaterial,
} from "./ai";
import {
	STATE_KEY,
	addMaterial,
	appendAssistantMessage,
	appendUserMessage,
	applyMaterialInsights,
	createSessionState,
	failWorkflow,
	markWorkflowRunning,
	saveFlashcards,
	saveQuiz,
} from "./state";
import type {
	Env,
	FlashcardsResponse,
	MaterialIngestionWorkflowParams,
	MaterialInsights,
	QuizResponse,
	StudyMaterial,
	StudySession,
} from "./types";

const encoder = new TextEncoder();

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === "OPTIONS") {
			return withCorsHeaders(new Response(null, { status: 204 }), request, env);
		}

		const url = new URL(request.url);
		const route = matchRoute(url.pathname);

		if (!route) {
			return jsonResponse({ error: "Not found" }, request, env, { status: 404 });
		}

		try {
			if (route.kind === "create-session" && request.method === "POST") {
				return handleCreateSession(env, request);
			}

			if (route.kind === "session" && request.method === "GET") {
				return handleGetSession(env, request, route.sessionId);
			}

			if (route.kind === "material" && request.method === "POST") {
				return handleAddMaterial(env, request, route.sessionId);
			}

			if (route.kind === "chat" && request.method === "POST") {
				return handleChat(env, request, route.sessionId);
			}

			if (route.kind === "flashcards" && request.method === "POST") {
				return handleFlashcards(env, request, route.sessionId);
			}

			if (route.kind === "quiz" && request.method === "POST") {
				return handleQuiz(env, request, route.sessionId);
			}
		} catch (error) {
			console.error("Worker request failed:", error);
			return jsonResponse(
				{ error: "The AI Learning Coach API hit an unexpected error." },
				request,
				env,
				{ status: 500 },
			);
		}

		return jsonResponse({ error: "Method not allowed" }, request, env, { status: 405 });
	},
} satisfies ExportedHandler<Env>;

type RouteMatch =
	| { kind: "create-session" }
	| { kind: "session"; sessionId: string }
	| { kind: "material"; sessionId: string }
	| { kind: "chat"; sessionId: string }
	| { kind: "flashcards"; sessionId: string }
	| { kind: "quiz"; sessionId: string };

function matchRoute(pathname: string): RouteMatch | null {
	const parts = pathname.split("/").filter(Boolean);

	if (parts.length === 2 && parts[0] === "api" && parts[1] === "session") {
		return { kind: "create-session" };
	}

	if (parts.length === 3 && parts[0] === "api" && parts[1] === "session") {
		const sessionId = normalizeSessionId(parts[2]);
		return sessionId ? { kind: "session", sessionId } : null;
	}

	if (parts.length === 4 && parts[0] === "api" && parts[1] === "session") {
		const sessionId = normalizeSessionId(parts[2]);
		if (!sessionId) {
			return null;
		}

		switch (parts[3]) {
			case "material":
				return { kind: "material", sessionId };
			case "chat":
				return { kind: "chat", sessionId };
			case "flashcards":
				return { kind: "flashcards", sessionId };
			case "quiz":
				return { kind: "quiz", sessionId };
			default:
				return null;
		}
	}

	return null;
}

export class LearningCoachSessionDurableObject extends DurableObject<Env> {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const sessionId = request.headers.get("x-session-id")?.trim() || this.ctx.id.toString();

		if (url.pathname === "/session" && request.method === "GET") {
			return new Response(JSON.stringify(await this.readState(sessionId)), {
				headers: { "content-type": "application/json; charset=utf-8" },
			});
		}

		if (url.pathname === "/messages/user" && request.method === "POST") {
			const body = (await request.json()) as { content?: string };
			const state = appendUserMessage(await this.readState(sessionId), body.content ?? "");
			return this.writeJson(state);
		}

		if (url.pathname === "/messages/assistant" && request.method === "POST") {
			const body = (await request.json()) as { content?: string };
			const state = appendAssistantMessage(await this.readState(sessionId), body.content ?? "");
			return this.writeJson(state);
		}

		if (url.pathname === "/materials" && request.method === "POST") {
			const body = (await request.json()) as {
				id?: string;
				title?: string;
				content?: string;
			};
			const result = addMaterial(await this.readState(sessionId), {
				id: body.id,
				title: body.title,
				content: body.content ?? "",
			});

			await this.ctx.storage.put(STATE_KEY, result.state);
			return new Response(
				JSON.stringify({
					session: result.state,
					material: result.material,
				}),
				{ headers: { "content-type": "application/json; charset=utf-8" } },
			);
		}

		if (url.pathname === "/workflow/start" && request.method === "POST") {
			const body = (await request.json()) as {
				workflowId?: string;
				materialId?: string;
			};
			const state = markWorkflowRunning(
				await this.readState(sessionId),
				body.workflowId ?? "",
				body.materialId ?? "",
			);
			return this.writeJson(state);
		}

		if (url.pathname === "/workflow/complete" && request.method === "POST") {
			const body = (await request.json()) as {
				workflowId?: string;
				materialId?: string;
				insights?: MaterialInsights;
			};
			const state = applyMaterialInsights(
				await this.readState(sessionId),
				body.workflowId ?? "",
				body.materialId ?? "",
				body.insights ?? { summary: "", concepts: [], weakAreas: [] },
			);
			return this.writeJson(state);
		}

		if (url.pathname === "/workflow/error" && request.method === "POST") {
			const body = (await request.json()) as {
				workflowId?: string;
				materialId?: string;
				error?: string;
			};
			const state = failWorkflow(
				await this.readState(sessionId),
				body.workflowId ?? "",
				body.materialId ?? "",
				body.error ?? "",
			);
			return this.writeJson(state);
		}

		if (url.pathname === "/flashcards" && request.method === "POST") {
			const body = (await request.json()) as FlashcardsResponse;
			const state = saveFlashcards(await this.readState(sessionId), body.flashcards ?? []);
			return this.writeJson(state);
		}

		if (url.pathname === "/quiz" && request.method === "POST") {
			const body = (await request.json()) as QuizResponse;
			const state = saveQuiz(await this.readState(sessionId), body.quiz ?? []);
			return this.writeJson(state);
		}

		return new Response("Not found", { status: 404 });
	}

	private async readState(sessionId: string): Promise<StudySession> {
		const existing = await this.ctx.storage.get<StudySession>(STATE_KEY);
		if (existing) {
			return existing;
		}

		const initial = createSessionState(sessionId);
		await this.ctx.storage.put(STATE_KEY, initial);
		return initial;
	}

	private async writeJson(state: StudySession): Promise<Response> {
		await this.ctx.storage.put(STATE_KEY, state);
		return new Response(JSON.stringify(state), {
			headers: { "content-type": "application/json; charset=utf-8" },
		});
	}
}

export class MaterialIngestionWorkflow extends WorkflowEntrypoint<
	Env,
	MaterialIngestionWorkflowParams
> {
	async run(
		event: Readonly<WorkflowEvent<MaterialIngestionWorkflowParams>>,
		step: WorkflowStep,
	): Promise<MaterialInsights> {
		try {
			const session = await step.do("load-session", async () =>
				callSession<StudySession>(this.env, event.payload.sessionId, "/session"),
			);

			const material = session.materials.find(
				(candidate) => candidate.id === event.payload.materialId,
			);
			if (!material) {
				throw new Error("Material not found for ingestion workflow.");
			}

			const summary = await step.do(
				"summarize-material",
				{
					retries: { limit: 2, delay: "5 seconds", backoff: "linear" },
					timeout: "90 seconds",
				},
				() => summarizeMaterial(this.env, material),
			);

			const extracted = await step.do(
				"extract-concepts-and-weak-areas",
				{
					retries: { limit: 2, delay: "5 seconds", backoff: "linear" },
					timeout: "90 seconds",
				},
				() => extractConceptsAndWeakAreas(this.env, material),
			);

			const insights: MaterialInsights = {
				summary,
				concepts: extracted.concepts,
				weakAreas: extracted.weakAreas,
			};

			await step.do("persist-material-insights", async () => {
				await callSession<StudySession>(
					this.env,
					event.payload.sessionId,
					"/workflow/complete",
					{
						method: "POST",
						body: JSON.stringify({
							workflowId: event.payload.workflowId,
							materialId: event.payload.materialId,
							insights,
						}),
					},
				);

				return { saved: true };
			});

			return insights;
		} catch (error) {
			await callSession<StudySession>(
				this.env,
				event.payload.sessionId,
				"/workflow/error",
				{
					method: "POST",
					body: JSON.stringify({
						workflowId: event.payload.workflowId,
						materialId: event.payload.materialId,
						error: getErrorMessage(error),
					}),
				},
			);

			throw error;
		}
	}
}

async function handleCreateSession(env: Env, request: Request): Promise<Response> {
	const sessionId = createSessionId();
	const session = await callSession<StudySession>(env, sessionId, "/session");
	return jsonResponse(session, request, env, { status: 201 });
}

async function handleGetSession(
	env: Env,
	request: Request,
	sessionId: string,
): Promise<Response> {
	const session = await callSession<StudySession>(env, sessionId, "/session");
	return jsonResponse(session, request, env);
}

async function handleAddMaterial(
	env: Env,
	request: Request,
	sessionId: string,
): Promise<Response> {
	const body = (await request.json()) as { title?: string; content?: string };
	const content = body.content?.trim() ?? "";
	if (!content) {
		return jsonResponse(
			{ error: "Material content is required." },
			request,
			env,
			{ status: 400 },
		);
	}

	const materialId = createSessionId();
	const result = await callSession<{ session: StudySession; material: StudyMaterial }>(
		env,
		sessionId,
		"/materials",
		{
			method: "POST",
			body: JSON.stringify({
				id: materialId,
				title: body.title,
				content,
			}),
		},
	);

	const workflowId = `material-${sessionId}-${Date.now()}`;
	const runningSession = await callSession<StudySession>(env, sessionId, "/workflow/start", {
		method: "POST",
		body: JSON.stringify({
			workflowId,
			materialId: result.material.id,
		}),
	});

	try {
		await env.MATERIAL_INGESTION_WORKFLOW.create({
			id: workflowId,
			params: {
				sessionId,
				materialId: result.material.id,
				workflowId,
			},
		});
	} catch (error) {
		await callSession<StudySession>(env, sessionId, "/workflow/error", {
			method: "POST",
			body: JSON.stringify({
				workflowId,
				materialId: result.material.id,
				error: getErrorMessage(error),
			}),
		});

		return jsonResponse(
			{ error: "The material ingestion workflow could not be started." },
			request,
			env,
			{ status: 500 },
		);
	}

	return jsonResponse(runningSession, request, env, { status: 201 });
}

async function handleChat(
	env: Env,
	request: Request,
	sessionId: string,
): Promise<Response> {
	const body = (await request.json()) as { message?: string };
	const message = body.message?.trim() ?? "";

	if (!message) {
		return jsonResponse(
			{ error: "A non-empty tutor message is required." },
			request,
			env,
			{ status: 400 },
		);
	}

	const session = await callSession<StudySession>(env, sessionId, "/messages/user", {
		method: "POST",
		body: JSON.stringify({ content: message }),
	});

	let modelStream: ReadableStream | null = null;

	try {
		modelStream = (await env.AI.run(CHAT_MODEL, {
			messages: buildChatMessages(session),
			max_tokens: 700,
			stream: true,
		})) as ReadableStream;
	} catch (error) {
		console.error("Failed to start tutor stream:", error);
		return jsonResponse(
			{ error: "The tutor response could not be started." },
			request,
			env,
			{ status: 500 },
		);
	}

	let assistantMessage = "";
	const stream = new ReadableStream({
		async start(controller) {
			try {
				assistantMessage = await relayModelStream(modelStream!, controller);
			} catch (error) {
				console.error("Tutor stream interrupted:", error);
				const fallback =
					assistantMessage.trim().length > 0
						? "\n\nI lost the connection mid-answer, but your study session is still saved."
						: "I hit a temporary issue while responding. Please try again.";
				assistantMessage += fallback;
				controller.enqueue(formatSseChunk(fallback));
			} finally {
				if (assistantMessage.trim()) {
					const updatedSession = await callSession<StudySession>(
						env,
						sessionId,
						"/messages/assistant",
						{
							method: "POST",
							body: JSON.stringify({ content: assistantMessage }),
						},
					);
					controller.enqueue(formatSseEvent({ session: updatedSession }));
				}

				controller.enqueue(encoder.encode("data: [DONE]\n\n"));
				controller.close();
			}
		},
	});

	return withCorsHeaders(
		new Response(stream, {
			headers: {
				"content-type": "text/event-stream; charset=utf-8",
				"cache-control": "no-cache",
				connection: "keep-alive",
			},
		}),
		request,
		env,
	);
}

async function handleFlashcards(
	env: Env,
	request: Request,
	sessionId: string,
): Promise<Response> {
	const body = (await request.json().catch(() => ({}))) as { count?: number };
	const session = await callSession<StudySession>(env, sessionId, "/session");
	const payload = await generateFlashcards(env, session, body.count);
	const updatedSession = await callSession<StudySession>(env, sessionId, "/flashcards", {
		method: "POST",
		body: JSON.stringify(payload),
	});

	return jsonResponse(
		{
			flashcards: updatedSession.flashcards,
			session: updatedSession,
		},
		request,
		env,
	);
}

async function handleQuiz(
	env: Env,
	request: Request,
	sessionId: string,
): Promise<Response> {
	const body = (await request.json().catch(() => ({}))) as { count?: number };
	const session = await callSession<StudySession>(env, sessionId, "/session");
	const payload = await generateQuiz(env, session, body.count);
	const updatedSession = await callSession<StudySession>(env, sessionId, "/quiz", {
		method: "POST",
		body: JSON.stringify(payload),
	});

	return jsonResponse(
		{
			quiz: updatedSession.quizzes,
			session: updatedSession,
		},
		request,
		env,
	);
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
			const parsed = consumeSseEvents(`${buffer}\n\n`);
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

		return parsed.response ?? parsed.choices?.[0]?.delta?.content ?? "";
	} catch {
		return "";
	}
}

function consumeSseEvents(buffer: string): { events: string[]; buffer: string } {
	let normalized = buffer.replace(/\r/g, "");
	const events: string[] = [];
	let boundary = normalized.indexOf("\n\n");

	while (boundary !== -1) {
		const rawEvent = normalized.slice(0, boundary);
		normalized = normalized.slice(boundary + 2);

		const dataLines = rawEvent
			.split("\n")
			.filter((line) => line.startsWith("data:"))
			.map((line) => line.slice("data:".length).trimStart());

		if (dataLines.length > 0) {
			events.push(dataLines.join("\n"));
		}

		boundary = normalized.indexOf("\n\n");
	}

	return { events, buffer: normalized };
}

function formatSseChunk(chunk: string): Uint8Array {
	return formatSseEvent({ response: chunk });
}

function formatSseEvent(payload: unknown): Uint8Array {
	return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

async function callSession<T>(
	env: Env,
	sessionId: string,
	pathname: string,
	init?: RequestInit,
): Promise<T> {
	const id = env.LEARNING_SESSIONS.idFromName(sessionId);
	const stub = env.LEARNING_SESSIONS.get(id);
	const request = new Request(`https://session${pathname}`, {
		...init,
		headers: {
			"content-type": "application/json",
			"x-session-id": sessionId,
			...(init?.headers ?? {}),
		},
	});

	const response = await stub.fetch(request);
	if (!response.ok) {
		throw new Error(`Session request failed: ${pathname}`);
	}

	return response.json<T>();
}

function createSessionId(): string {
	return crypto.randomUUID().replace(/-/g, "");
}

function normalizeSessionId(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}

	const normalized = value.trim();
	return /^[a-zA-Z0-9_-]{8,120}$/.test(normalized) ? normalized : null;
}

function getCorsOrigin(request: Request, env: Env): string {
	const configured = env.CORS_ORIGIN?.trim();
	if (configured) {
		return configured;
	}

	return request.headers.get("origin")?.trim() || "*";
}

function withCorsHeaders(response: Response, request: Request, env: Env): Response {
	const headers = new Headers(response.headers);
	headers.set("Access-Control-Allow-Origin", getCorsOrigin(request, env));
	headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
	headers.set("Access-Control-Allow-Headers", "content-type");
	headers.set("Vary", "Origin");

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

function jsonResponse(
	data: unknown,
	request: Request,
	env: Env,
	init?: ResponseInit,
): Response {
	const response = new Response(JSON.stringify(data), {
		...init,
		headers: {
			"content-type": "application/json; charset=utf-8",
			...(init?.headers ?? {}),
		},
	});

	return withCorsHeaders(response, request, env);
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Unknown error";
}
