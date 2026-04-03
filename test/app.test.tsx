// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../app/src/App";
import type { StudySession } from "../app/src/lib/types";

function createSession(overrides: Partial<StudySession> = {}): StudySession {
	const now = "2026-04-03T12:00:00.000Z";

	return {
		id: "session-1",
		title: "New study session",
		createdAt: now,
		updatedAt: now,
		materials: [],
		messages: [
			{
				role: "assistant",
				content:
					"Share a topic or paste class notes, and I'll help you study with concise explanations, flashcards, and practice questions.",
				timestamp: now,
			},
		],
		flashcards: [],
		quizzes: [],
		summary: "",
		weakAreas: [],
		workflowStatus: {
			status: "idle",
			workflowId: null,
			materialId: null,
			error: null,
			updatedAt: null,
		},
		...overrides,
	};
}

function createSseResponse(payloads: Array<string | object>) {
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			for (const payload of payloads) {
				const body = typeof payload === "string" ? payload : JSON.stringify(payload);
				controller.enqueue(encoder.encode(`data: ${body}\n\n`));
			}
			controller.enqueue(encoder.encode("data: [DONE]\n\n"));
			controller.close();
		},
	});

	return new Response(stream, {
		headers: {
			"content-type": "text/event-stream; charset=utf-8",
		},
	});
}

function createDeferredSseResponse(
	payloads: Array<string | object>,
	delayMs = 25,
) {
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		async start(controller) {
			for (const payload of payloads) {
				const body = typeof payload === "string" ? payload : JSON.stringify(payload);
				controller.enqueue(encoder.encode(`data: ${body}\n\n`));
				await new Promise((resolve) => setTimeout(resolve, delayMs));
			}
			controller.enqueue(encoder.encode("data: [DONE]\n\n"));
			controller.close();
		},
	});

	return new Response(stream, {
		headers: {
			"content-type": "text/event-stream; charset=utf-8",
		},
	});
}

describe("AI Learning Coach app", () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("creates a new session on first load and can switch between sidebar sessions", async () => {
		const firstSession = createSession({ id: "session-1", title: "Biology review" });
		const secondSession = createSession({
			id: "session-2",
			title: "Calculus practice",
			updatedAt: "2026-04-03T12:15:00.000Z",
		});

		window.localStorage.setItem(
			"learning-coach-recent-sessions",
			JSON.stringify([
				{ id: "session-1", title: "Biology review", updatedAt: firstSession.updatedAt },
				{ id: "session-2", title: "Calculus practice", updatedAt: secondSession.updatedAt },
			]),
		);

		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.endsWith("/api/session/session-1")) {
				return new Response(JSON.stringify(firstSession), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}

			if (url.endsWith("/api/session/session-2")) {
				return new Response(JSON.stringify(secondSession), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}

			throw new Error(`Unexpected request: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<App />);

		expect(await screen.findByRole("heading", { name: "AI Learning Coach" })).toBeTruthy();
		expect(await screen.findByRole("button", { name: /Biology review/i })).toBeTruthy();

		await userEvent.click(screen.getByRole("button", { name: /Calculus practice/i }));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith("/api/session/session-2");
		});
	});

	it("uploads study material and renders a streamed tutor answer", async () => {
		const initialSession = createSession();
		const materialSession = createSession({
			id: "session-1",
			title: "Lecture 4 notes",
			updatedAt: "2026-04-03T12:05:00.000Z",
			materials: [
				{
					id: "mat-1",
					title: "Lecture 4 notes",
					content: "Mitosis creates two identical daughter cells.",
					summary: "Mitosis creates two identical daughter cells through four main phases.",
					concepts: ["Mitosis", "Daughter cells"],
					createdAt: "2026-04-03T12:04:00.000Z",
					updatedAt: "2026-04-03T12:05:00.000Z",
				},
			],
			summary: "Mitosis creates two identical daughter cells through four main phases.",
			weakAreas: ["Ordering mitosis phases"],
			workflowStatus: {
				status: "complete",
				workflowId: "wf-1",
				materialId: "mat-1",
				error: null,
				updatedAt: "2026-04-03T12:05:00.000Z",
			},
		});
		const chatCompleteSession = {
			...materialSession,
			updatedAt: "2026-04-03T12:06:00.000Z",
			messages: [
				...materialSession.messages,
				{
					role: "user" as const,
					content: "Explain mitosis in simple terms.",
					timestamp: "2026-04-03T12:05:30.000Z",
				},
				{
					role: "assistant" as const,
					content:
						"**Mitosis** is the process where one cell divides into two identical cells.\n\nA good memory aid is PMAT: prophase, metaphase, anaphase, telophase.",
					timestamp: "2026-04-03T12:06:00.000Z",
				},
			],
		};

		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);

			if (url === "/api/session" && init?.method === "POST") {
				return new Response(JSON.stringify(initialSession), {
					status: 201,
					headers: { "content-type": "application/json" },
				});
			}

			if (url === "/api/session/session-1/material" && init?.method === "POST") {
				return new Response(JSON.stringify(materialSession), {
					status: 201,
					headers: { "content-type": "application/json" },
				});
			}

			if (url === "/api/session/session-1/chat" && init?.method === "POST") {
				return createSseResponse([
					{ response: "**Mitosis** is the process where one cell divides into two identical cells." },
					{ session: chatCompleteSession },
				]);
			}

			throw new Error(`Unexpected request: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<App />);

		await screen.findByRole("heading", { name: "AI Learning Coach" });
		await userEvent.type(
			screen.getByPlaceholderText("Optional title, for example Lecture 4 notes"),
			"Lecture 4 notes",
		);
		await userEvent.type(
			screen.getByPlaceholderText("Paste lecture notes, textbook excerpts, or study guide text..."),
			"Mitosis creates two identical daughter cells.",
		);
		await userEvent.click(screen.getByRole("button", { name: "Save Material" }));

		expect(await screen.findByText("Ordering mitosis phases")).toBeTruthy();

		await userEvent.type(
			screen.getByPlaceholderText(
				"Ask about a concept, request a simpler explanation, or use your uploaded notes...",
			),
			"Explain mitosis in simple terms.",
		);
		await userEvent.click(screen.getByRole("button", { name: "Send" }));

		expect(await screen.findByText(/PMAT: prophase, metaphase, anaphase, telophase/i)).toBeTruthy();
	});

	it("generates flashcards and a quiz from the current session", async () => {
		const session = createSession({
			id: "session-1",
			title: "Chemistry notes",
			materials: [
				{
					id: "chem-1",
					title: "Chemistry notes",
					content: "Acids donate protons and bases accept protons.",
					summary: "Acids donate protons while bases accept protons.",
					concepts: ["Acids", "Bases"],
					createdAt: "2026-04-03T12:00:00.000Z",
					updatedAt: "2026-04-03T12:00:00.000Z",
				},
			],
			summary: "Acids donate protons while bases accept protons.",
		});
		const flashcardSession = {
			...session,
			flashcards: [
				{
					front: "Explain acids.",
					back: "Acids donate protons in chemical reactions.",
				},
			],
		};
		const quizSession = {
			...flashcardSession,
			quizzes: [
				{
					question: "Which statement describes a base?",
					options: [
						"A base accepts protons",
						"A base donates electrons to become an acid",
						"A base is always neutral",
						"A base cannot dissolve in water",
					],
					answer: "A base accepts protons",
					explanation: "By Bronsted-Lowry definition, bases accept protons.",
				},
			],
		};

		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url === "/api/session" && init?.method === "POST") {
				return new Response(JSON.stringify(session), {
					status: 201,
					headers: { "content-type": "application/json" },
				});
			}

			if (url === "/api/session/session-1/flashcards" && init?.method === "POST") {
				return new Response(JSON.stringify({ flashcards: flashcardSession.flashcards, session: flashcardSession }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}

			if (url === "/api/session/session-1/quiz" && init?.method === "POST") {
				return new Response(JSON.stringify({ quiz: quizSession.quizzes, session: quizSession }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}

			throw new Error(`Unexpected request: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<App />);

		await screen.findByRole("heading", { name: "AI Learning Coach" });

		await userEvent.click(screen.getByRole("button", { name: "Flashcards" }));
		await userEvent.click(screen.getByRole("button", { name: "Generate Flashcards" }));
		expect(await screen.findByText("Explain acids.")).toBeTruthy();
		await userEvent.click(await screen.findByRole("button", { name: /reveal answer/i }));
		expect(await screen.findByText("Acids donate protons in chemical reactions.")).toBeTruthy();

		await userEvent.click(screen.getByRole("button", { name: "Quiz" }));
		await userEvent.click(screen.getByRole("button", { name: "Generate Quiz" }));
		expect(await screen.findByText("Which statement describes a base?")).toBeTruthy();
		await userEvent.click(screen.getByRole("button", { name: /A base accepts protons/i }));
		await userEvent.click(screen.getByRole("button", { name: "Check answer" }));
		expect(await screen.findByText("By Bronsted-Lowry definition, bases accept protons.")).toBeTruthy();
	});

	it("does not overwrite the active view if the user switches sessions during a streamed reply", async () => {
		const sessionOne = createSession({
			id: "session-1",
			title: "Biology review",
			updatedAt: "2026-04-03T12:00:00.000Z",
		});
		const sessionTwo = createSession({
			id: "session-2",
			title: "History review",
			updatedAt: "2026-04-03T12:10:00.000Z",
			materials: [
				{
					id: "hist-1",
					title: "History review",
					content: "The treaty ended the war.",
					summary: "A short history summary.",
					concepts: ["Treaty", "Reparations"],
					createdAt: "2026-04-03T12:10:00.000Z",
					updatedAt: "2026-04-03T12:10:00.000Z",
				},
			],
			summary: "A short history summary.",
		});
		const completedSessionOne = {
			...sessionOne,
			messages: [
				...sessionOne.messages,
				{
					role: "user" as const,
					content: "Explain mitosis.",
					timestamp: "2026-04-03T12:00:30.000Z",
				},
				{
					role: "assistant" as const,
					content: "This is the biology reply that should stay in session one.",
					timestamp: "2026-04-03T12:01:00.000Z",
				},
			],
		};

		window.localStorage.setItem(
			"learning-coach-recent-sessions",
			JSON.stringify([
				{ id: "session-1", title: "Biology review", updatedAt: sessionOne.updatedAt },
				{ id: "session-2", title: "History review", updatedAt: sessionTwo.updatedAt },
			]),
		);

		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url === "/api/session/session-1") {
				return new Response(JSON.stringify(sessionOne), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			if (url === "/api/session/session-2") {
				return new Response(JSON.stringify(sessionTwo), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			if (url === "/api/session/session-1/chat" && init?.method === "POST") {
				return createDeferredSseResponse(
					[
						{ response: "This is the biology reply that should stay in session one." },
						{ session: completedSessionOne },
					],
					50,
				);
			}

			throw new Error(`Unexpected request: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<App />);

		await screen.findByRole("heading", { name: "AI Learning Coach" });
		await userEvent.type(
			screen.getByPlaceholderText(
				"Ask about a concept, request a simpler explanation, or use your uploaded notes...",
			),
			"Explain mitosis.",
		);
		await userEvent.click(screen.getByRole("button", { name: "Send" }));

		await userEvent.click(await screen.findByRole("button", { name: /History review/i }));

		await waitFor(() => {
			expect(screen.getAllByText("A short history summary.").length).toBeGreaterThan(0);
		});

		await new Promise((resolve) => setTimeout(resolve, 140));

		expect(
			screen.queryByText("This is the biology reply that should stay in session one."),
		).toBeNull();
	});
});
