import { afterEach, describe, expect, it, vi } from "vitest";
import {
	buildChatMessages,
	TUTOR_SYSTEM_PROMPT,
	extractConceptsAndWeakAreas,
	generateFlashcards,
	generateQuiz,
	summarizeMaterial,
} from "../src/ai";
import { addMaterial, createSessionState } from "../src/state";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("AI learning coach fallbacks", () => {
	it("falls back to deterministic note summarization and extraction when Workers AI fails", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});

		const material = addMaterial(createSessionState("session-1"), {
			id: "bio-1",
			title: "Photosynthesis review",
			content:
				"Photosynthesis converts light energy into chemical energy. The light-dependent reactions occur in the thylakoid membranes. The Calvin cycle fixes carbon dioxide into sugars.",
		}).material;

		const env = {
			AI: {
				run: async () => {
					throw new Error("Upstream timeout");
				},
			},
		} as unknown as Cloudflare.Env;

		const [summary, extracted] = await Promise.all([
			summarizeMaterial(env, material),
			extractConceptsAndWeakAreas(env, material),
		]);

		expect(summary).toContain("Photosynthesis converts light energy");
		expect(extracted.concepts.length).toBeGreaterThan(0);
		expect(extracted.weakAreas.length).toBeGreaterThan(0);
	});

	it("returns complete fallback flashcards and quiz content when model output is unavailable", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});

		const added = addMaterial(createSessionState("session-2"), {
			id: "chem-1",
			title: "Acids and bases",
			content:
				"Acids donate protons and bases accept protons. Strong acids dissociate almost completely in water.",
		}).state;

		const session = {
			...added,
			materials: [
				{
					...added.materials[0]!,
					summary: "Acids donate protons, while bases accept protons in chemical reactions.",
					concepts: ["Acids", "Bases", "Strong acid dissociation"],
				},
			],
			weakAreas: ["Comparing strong and weak acids"],
		};

		const env = {
			AI: {
				run: async () => {
					throw new Error("Workers AI unavailable");
				},
			},
		} as unknown as Cloudflare.Env;

		const flashcards = await generateFlashcards(env, session, 5);
		const quiz = await generateQuiz(env, session, 5);

		expect(flashcards.flashcards.length).toBeGreaterThan(0);
		expect(flashcards.flashcards[0]?.front).toContain("Explain");
		expect(quiz.quiz.length).toBeGreaterThan(0);
		expect(quiz.quiz[0]?.options).toHaveLength(4);
		expect(quiz.quiz[0]?.options).toContain(quiz.quiz[0]?.answer);
	});

	it("injects uploaded material summaries and weak areas into chat context", () => {
		const added = addMaterial(createSessionState("session-3"), {
			id: "hist-1",
			title: "History notes",
			content:
				"The Treaty of Versailles ended World War I and imposed reparations on Germany.",
		}).state;

		const session = {
			...added,
			summary: "The Treaty of Versailles ended World War I and imposed reparations on Germany.",
			weakAreas: ["Explaining the treaty's consequences"],
			materials: [
				{
					...added.materials[0]!,
					summary:
						"The Treaty of Versailles formally ended World War I and reshaped postwar Europe.",
					concepts: ["Treaty of Versailles", "Reparations"],
				},
			],
		};

		const messages = buildChatMessages(session);
		const systemPrompt = messages[0]?.content ?? "";

		expect(systemPrompt).toContain("Primary study context");
		expect(systemPrompt).toContain("Treaty of Versailles formally ended World War I");
		expect(systemPrompt).toContain("Explaining the treaty's consequences");
	});

	it("includes study-note formatting guidance in the tutor system prompt", () => {
		expect(TUTOR_SYSTEM_PROMPT).toContain("default to a clean study-note format");
		expect(TUTOR_SYSTEM_PROMPT).toContain("begin with a 1 to 2 sentence direct answer");
		expect(TUTOR_SYSTEM_PROMPT).toContain("Avoid:");
	});

	it("parses structured non-string Workers AI responses for summary and extraction", async () => {
		const material = addMaterial(createSessionState("session-4"), {
			id: "bio-2",
			title: "Cell transport",
			content: "Diffusion moves particles from high concentration to low concentration.",
		}).material;

		let callCount = 0;
		const env = {
			AI: {
				run: async () => {
					callCount += 1;
					if (callCount === 1) {
						return {
							response: {
								text: "Diffusion moves particles from high concentration to low concentration.",
							},
						};
					}

					return {
						response: [
							{
								text: JSON.stringify({
									concepts: ["Diffusion", "Concentration gradient"],
									weakAreas: ["Explaining passive transport"],
								}),
							},
						],
					};
				},
			},
		} as unknown as Cloudflare.Env;

		const summary = await summarizeMaterial(env, material);
		const extracted = await extractConceptsAndWeakAreas(env, material);

		expect(summary).toContain("Diffusion moves particles");
		expect(extracted.concepts).toContain("Diffusion");
		expect(extracted.weakAreas).toContain("Explaining passive transport");
	});
});
