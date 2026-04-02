// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HashRouter } from "react-router-dom";
import App from "../app/src/App";
import type { ProjectState } from "../app/src/lib/types";

function createState(overrides: Partial<ProjectState> = {}): ProjectState {
	return {
		revision: 0,
		messages: [
			{
				role: "assistant",
				content:
					"Describe the AI product or workflow you want to test, and I'll turn it into a target user, believable MVP wedge, and launch plan.",
			},
		],
		ideaName: "",
		oneLiner: "",
		targetUser: "",
		problem: "",
		solution: "",
		keyFeatures: [],
		mvpScope: [],
		risks: [],
		openQuestions: [],
		competitorUrls: [],
		competitorResearch: [],
		marketInsights: [],
		recommendedWedge: "",
		differentiation: null,
		researchStatus: {
			stage: "idle",
			totalCompetitors: 0,
			completedCompetitors: 0,
			failedCompetitors: 0,
			updatedAt: null,
		},
		researchErrors: [],
		workflowStatus: {
			status: "idle",
			workflowId: null,
			sourceRevision: null,
			error: null,
			updatedAt: null,
		},
		launchBrief: null,
		checklist: [],
		validationPlan: [],
		customerQuestions: [],
		outreachMessage: "",
		decisionBoard: null,
		messagingKit: null,
		cloudflarePlan: null,
		implementationKit: null,
		pitchDeck: [],
		forecast: [],
		websitePrototype: null,
		...overrides,
	};
}

function createSseResponse(payloads: Array<string | object>) {
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			for (const payload of payloads) {
				const body =
					typeof payload === "string" ? payload : JSON.stringify(payload);
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

describe("LaunchLens app", () => {
	beforeEach(() => {
		window.localStorage.clear();
		window.location.hash = "#/";
		vi.stubGlobal("scrollTo", vi.fn());
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("opens the workspace from the landing page", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/api/state")) {
				return new Response(JSON.stringify(createState()), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			throw new Error(`Unexpected request: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		render(
			<HashRouter>
				<App />
			</HashRouter>,
		);

		await userEvent.click(await screen.findByRole("button", { name: "Open Workspace" }));

		expect(
			await screen.findByRole("heading", {
				name: "See whether this AI app is worth building.",
			}),
		).toBeTruthy();
		expect(
			await screen.findByText("Include the user, the workflow, and why it matters. You can also paste a product URL."),
		).toBeTruthy();
		expect(
			await screen.findByText("Understand the idea in one pass"),
		).toBeTruthy();
		expect(await screen.findByRole("button", { name: "Try Support copilot" })).toBeTruthy();
	});

	it("sends a message through the chat button and renders the streamed reply", async () => {
		const initialState = createState();
		const finalState = createState({
			revision: 2,
			messages: [
				...initialState.messages,
				{
					role: "user",
					content:
						"Build an AI support copilot for API companies that drafts better replies from docs and ticket history.",
				},
				{
					role: "assistant",
					content:
						"**Target user** Lean API support teams\n\n**Next move** Validate the support copilot with one design-partner support team.",
				},
			],
			ideaName: "Support Copilot",
			oneLiner:
				"Build an AI support copilot for API companies that drafts better replies from docs and ticket history.",
			competitorUrls: ["https://www.intercom.com"],
		});

		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.includes("/api/state")) {
				return new Response(JSON.stringify(initialState), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			if (url === "/api/chat" && init?.method === "POST") {
				return createSseResponse([
					{ response: "**Target user** Lean API support teams" },
					{ state: finalState },
				]);
			}
			throw new Error(`Unexpected request: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		render(
			<HashRouter>
				<App />
			</HashRouter>,
		);

		await userEvent.click(await screen.findByRole("button", { name: "Open Workspace" }));
		await userEvent.type(
			await screen.findByPlaceholderText(
				"AI support copilot for API companies that drafts replies from docs and tickets.",
			),
			"Build an AI support copilot for API companies that drafts better replies from docs and ticket history.",
		);
		await userEvent.click(screen.getByRole("button", { name: "Send" }));

		expect(
			await screen.findByText("Validate the support copilot with one design-partner support team."),
		).toBeTruthy();
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/chat",
			expect.objectContaining({
				method: "POST",
			}),
		);
	});

	it("loads a starter prompt from the landing page and opens the workspace", async () => {
		const initialState = createState();
		const finalState = createState({
			revision: 2,
			messages: [
				...initialState.messages,
				{
					role: "user",
					content:
						"Build an AI concierge for boutique hotels that helps front desk teams answer guest questions faster and upsell the right services.",
				},
				{
					role: "assistant",
					content:
						"**Target user** Boutique hotel front desk teams\n\n**Next move** Pilot the concierge with one property and measure response time.",
				},
			],
			ideaName: "AI Concierge",
			oneLiner:
				"Build an AI concierge for boutique hotels that helps front desk teams answer guest questions faster and upsell the right services.",
			competitorUrls: ["https://www.canarytechnologies.com", "https://www.mews.com"],
		});

		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.includes("/api/state")) {
				return new Response(JSON.stringify(initialState), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			if (url === "/api/chat" && init?.method === "POST") {
				return createSseResponse([
					{ response: "**Target user** Boutique hotel front desk teams" },
					{ state: finalState },
				]);
			}
			if (url === "/api/competitors" && init?.method === "POST") {
				return new Response(JSON.stringify(createState({
					competitorUrls: ["https://www.canarytechnologies.com", "https://www.mews.com"],
				})), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			throw new Error(`Unexpected request: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		render(
			<HashRouter>
				<App />
			</HashRouter>,
		);

		await userEvent.click(await screen.findByRole("button", { name: /Hotel concierge agent/i }));

		expect(
			await screen.findByRole("heading", {
				name: "See whether this AI app is worth building.",
			}),
		).toBeTruthy();
		expect(
			await screen.findByText("Pilot the concierge with one property and measure response time."),
		).toBeTruthy();
	});

	it("adds competitor URLs from the workspace and renders the saved chip", async () => {
		const stateWithCompetitor = createState({
			competitorUrls: ["https://notion.so"],
		});

		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.includes("/api/state")) {
				return new Response(JSON.stringify(createState()), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			if (url === "/api/competitors" && init?.method === "POST") {
				return new Response(JSON.stringify(stateWithCompetitor), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			throw new Error(`Unexpected request: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		render(
			<HashRouter>
				<App />
			</HashRouter>,
		);

		await userEvent.click(await screen.findByRole("button", { name: "Open Workspace" }));
		await userEvent.click(screen.getByRole("button", { name: "Edit sources" }));
		await userEvent.type(
			await screen.findByPlaceholderText(
				"Paste competitor URLs separated by commas or new lines...",
			),
			"https://notion.so",
		);
		await userEvent.click(screen.getByRole("button", { name: "Add URLs" }));

		expect(await screen.findByText("https://notion.so")).toBeTruthy();
	});

	it("returns to the landing page from the workspace back button", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/api/state")) {
				return new Response(JSON.stringify(createState()), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			throw new Error(`Unexpected request: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		render(
			<HashRouter>
				<App />
			</HashRouter>,
		);

		await userEvent.click(await screen.findByRole("button", { name: "Open Workspace" }));
		await userEvent.click(screen.getByRole("button", { name: "Back To Landing" }));

		expect(
			await screen.findByRole("heading", {
				name: "Go from AI app idea to Cloudflare build plan.",
			}),
		).toBeTruthy();
	});

	it("runs the audit, shows the Cloudflare plan, and resets to a fresh session", async () => {
		const stateWithUserMessage = createState({
			revision: 2,
			messages: [
				{
					role: "assistant",
					content:
						"Describe the AI product or workflow you want to test, and I'll turn it into a target user, believable MVP wedge, and launch plan.",
				},
				{
					role: "user",
					content:
						"Design a receipt-based budgeting coach for busy families that turns grocery purchases into weekly savings recommendations.",
				},
			],
			ideaName: "Receipt-Based Budgeting Coach",
			oneLiner:
				"Design a receipt-based budgeting coach for busy families that turns grocery purchases into weekly savings recommendations.",
			competitorUrls: ["https://www.rocketmoney.com", "https://www.ynab.com"],
		});

		const launchPackState = createState({
			...stateWithUserMessage,
			workflowStatus: {
				status: "complete",
				workflowId: "wf-1",
				sourceRevision: 2,
				error: null,
				updatedAt: new Date().toISOString(),
			},
			researchStatus: {
				stage: "complete",
				totalCompetitors: 2,
				completedCompetitors: 2,
				failedCompetitors: 0,
				updatedAt: new Date().toISOString(),
			},
			competitorResearch: [
				{
					url: "https://www.rocketmoney.com",
					hostname: "rocketmoney.com",
					brandName: "Rocketmoney",
					title: "Rocket Money",
					summary: "Budgeting and subscription management.",
					positioning: "A broad personal finance assistant.",
					targetAudience: "Consumers managing recurring spending",
					pricingHints: ["free trial"],
					keyFeatures: ["Subscription tracking", "Budgeting"],
					cta: "Get started",
					status: "complete",
				},
			],
			marketInsights: [
				{
					title: "Whitespace",
					description: "Focus on grocery receipt coaching instead of all-purpose budgeting.",
				},
			],
			recommendedWedge:
				"Lead with weekly grocery savings coaching instead of full personal-finance management.",
			differentiation: {
				headline: "Own the grocery coaching wedge.",
				whyItWins: "It is easier to explain and activate than a full budgeting suite.",
				messagingPillars: ["Grocery-first", "Weekly wins", "Family-friendly"],
			},
			launchBrief: {
				summary:
					"Receipt-Based Budgeting Coach helps busy families turn grocery spending into weekly savings decisions.",
				audience: "Busy families with recurring grocery spend",
				valueProposition: "Weekly savings recommendations from real purchase history.",
				launchStrategy: "Pilot with five families and measure repeat weekly check-ins.",
				successMetric: "Weekly active families completing one savings action.",
			},
			checklist: ["Ship receipt upload", "Recruit five pilot households"],
			validationPlan: ["Interview five budget-conscious families"],
			customerQuestions: ["What do you do today to manage grocery spend?"],
			outreachMessage: "Hi [Name] — I’m testing a grocery coaching product for families.",
			decisionBoard: {
				buildNow: ["Receipt upload", "Weekly grocery savings summary"],
				avoidNow: ["Full personal finance suite"],
				proofPoints: ["Families return weekly"],
				firstSalesMotion: "Reach out to parent groups and budgeting communities.",
			},
			messagingKit: {
				homepageHeadline: "Turn grocery receipts into weekly savings wins.",
				homepageSubheadline: "A focused coach for busy families who want better grocery decisions without full-time budgeting.",
				elevatorPitch: "We help families use real grocery receipts to spot savings opportunities every week.",
				demoOpener: "This is a grocery-first budgeting coach, not a generic finance app.",
			},
			cloudflarePlan: {
				summary: "Use Workers AI and Durable Objects for the coaching loop, then push heavier synthesis into Workflows.",
				architecture: "Keep receipt coaching interactive at the edge and move weekly analysis into the background.",
				services: [
					{ service: "Workers AI", why: "Generate the coaching responses." },
					{ service: "Durable Objects", why: "Persist the family session state." },
				],
				launchSequence: ["Ship the core coaching loop first"],
				edgeAdvantage: "Fast weekly recommendations with persistent state.",
			},
			implementationKit: {
				productSpec: "Receipt-Based Budgeting Coach is an AI product for busy families that turns grocery receipt history into weekly savings coaching.",
				codingPrompt: "Build a polished MVP for Receipt-Based Budgeting Coach as a Cloudflare-native AI application.",
				agentPrompt: "You are a forward-deployed engineer helping ship Receipt-Based Budgeting Coach on Cloudflare.",
				starterTasks: ["Implement the weekly coaching loop first"],
			},
			forecast: [
				{ label: "Week 1", value: 8 },
				{ label: "Week 2", value: 18 },
			],
			websitePrototype: {
				title: "Receipt-Based Budgeting Coach",
				summary: "A focused concept preview for budget-conscious families.",
				html: "<!doctype html><html><body><h1>Receipt-Based Budgeting Coach</h1></body></html>",
			},
		});

		const freshState = createState();
		const stateResponses = [stateWithUserMessage, launchPackState, freshState];

		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.includes("/api/state")) {
				const nextState = stateResponses.shift() ?? freshState;
				return new Response(JSON.stringify(nextState), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			if (url === "/api/run-analysis" && init?.method === "POST") {
				return new Response(JSON.stringify({ status: "running" }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			if (url === "/api/reset" && init?.method === "POST") {
				return new Response(JSON.stringify(freshState), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			throw new Error(`Unexpected request: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		render(
			<HashRouter>
				<App />
			</HashRouter>,
		);

		await userEvent.click(await screen.findByRole("button", { name: "Open Workspace" }));
		await userEvent.click(
			await screen.findByRole("button", { name: "Run Audit & Plan" }),
		);

		expect(
			(await screen.findAllByRole("heading", { name: "Receipt-Based Budgeting Coach" })).length,
		).toBeGreaterThan(0);
		await userEvent.click(screen.getByRole("button", { name: "Build on Cloudflare" }));
		expect(await screen.findByText("Workers AI")).toBeTruthy();
		expect(await screen.findByRole("button", { name: "Copy Full Build Kit" })).toBeTruthy();
		expect(await screen.findByRole("button", { name: "Export Build Kit" })).toBeTruthy();
		expect(
			(
				await screen.findAllByText(
					"Use Workers AI and Durable Objects for the coaching loop, then push heavier synthesis into Workflows.",
				)
			).length,
		).toBeGreaterThan(0);
		expect(await screen.findByText("Prompt for a coding agent")).toBeTruthy();
		expect(
			await screen.findByText(
				"Build a polished MVP for Receipt-Based Budgeting Coach as a Cloudflare-native AI application.",
			),
		).toBeTruthy();

		const previousSessionId = window.localStorage.getItem("idea-to-launch-session-id");
		await userEvent.click(screen.getByRole("button", { name: "New Session" }));

		expect(
			await screen.findByRole("heading", {
				name: "Go from AI app idea to Cloudflare build plan.",
			}),
		).toBeTruthy();
		await waitFor(() => {
			expect(window.localStorage.getItem("idea-to-launch-session-id")).not.toBe(
				previousSessionId,
			);
		});
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/reset",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ sessionId: previousSessionId }),
			}),
		);
	});
});
