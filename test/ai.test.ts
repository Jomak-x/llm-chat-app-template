import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyResearchResult, generateLaunchArtifacts } from "../src/ai";
import { createDefaultState, appendUserMessage, mergeSnapshot } from "../src/state";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("AI artifact generation fallbacks", () => {
	it("returns a complete deterministic artifact set when Workers AI fails", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});

		const baseState = appendUserMessage(
			createDefaultState(),
			"Build an AI concierge for boutique hotels that answers guest questions faster.",
		);
		const state = mergeSnapshot(baseState, {
			ideaName: "HotelFlow",
			oneLiner: "An AI concierge for boutique hotel teams",
			targetUser: "Boutique hotel staff",
			problem: "Guest questions interrupt staff and create inconsistent responses.",
			solution: "A guided concierge workspace that drafts fast, on-brand answers.",
			keyFeatures: ["Shared inbox", "Suggested answers", "Knowledge snippets"],
			mvpScope: ["Inbox", "Suggested reply", "Admin setup"],
			risks: ["Need strong response quality"],
			openQuestions: ["Should the first wedge be front desk teams or guest messaging teams?"],
		});

		const env = {
			AI: {
				run: async () => {
					throw new Error("Upstream timeout");
				},
			},
		} as unknown as Pick<Cloudflare.Env, "AI">;

		const artifacts = await generateLaunchArtifacts(
			env,
			state,
			createEmptyResearchResult(),
		);

		expect(artifacts.launchBrief.summary).toContain("HotelFlow");
		expect(artifacts.checklist.length).toBeGreaterThan(0);
		expect(artifacts.validationPlan.length).toBeGreaterThan(0);
		expect(artifacts.customerQuestions.length).toBeGreaterThan(0);
		expect(artifacts.outreachMessage).toContain("HotelFlow");
		expect(artifacts.decisionBoard.buildNow.length).toBeGreaterThan(0);
		expect(artifacts.decisionBoard.firstSalesMotion.length).toBeGreaterThan(0);
		expect(artifacts.messagingKit.homepageHeadline.length).toBeGreaterThan(0);
		expect(artifacts.messagingKit.demoOpener.length).toBeGreaterThan(0);
		expect(artifacts.cloudflarePlan.summary).toContain("Cloudflare");
		expect(artifacts.cloudflarePlan.services.length).toBeGreaterThan(0);
		expect(artifacts.implementationKit.productSpec).toContain("HotelFlow");
		expect(artifacts.implementationKit.codingPrompt).toContain("Cloudflare-native");
		expect(artifacts.implementationKit.starterTasks.length).toBeGreaterThan(0);
		expect(artifacts.pitchDeck.length).toBeGreaterThan(0);
		expect(artifacts.forecast.length).toBe(5);
		expect(artifacts.websitePrototype.title).toContain("HotelFlow");
		expect(artifacts.websitePrototype.html).toContain("<!doctype html>");
	});
});
