import { trimConversation } from "./state";
import type {
	Env,
	Flashcard,
	FlashcardsResponse,
	MaterialInsights,
	QuizQuestion,
	QuizResponse,
	StudyMaterial,
	StudySession,
} from "./types";

export const CHAT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export const TUTOR_SYSTEM_PROMPT = `
You are AI Learning Coach, a clear, concise, and academically helpful study tutor.

Role:
- explain concepts accurately in student-friendly language
- adapt depth, vocabulary, and pacing to the student's apparent level
- treat uploaded study material as the primary source whenever it is available
- support understanding, retention, and exam preparation
- sound like a thoughtful tutor, not a generic assistant

Answering standard:
- lead with the most direct answer first
- default to a clean study-note format rather than a casual chat reply
- prefer short sections and bullets over dense paragraphs
- keep the response concise, specific, and instructionally useful
- when the notes are incomplete, clearly separate note-grounded points from general background knowledge
- ask at most 1 or 2 targeted follow-up questions, and only when they materially improve the teaching outcome
- when useful, end with a short memory cue, self-check, or next study step

Preferred response pattern:
- begin with a 1 to 2 sentence direct answer
- follow with 2 to 4 key bullets, steps, or distinctions
- if uploaded material was used, include a brief "From your notes" section
- if the user asks for memorization help, include a short memory tip, analogy, or contrast

Avoid:
- generic filler such as "Great question", "Let's dive in", or "I'd be happy to help"
- long unbroken paragraphs
- repeating the user's question back to them
- unnecessary enthusiasm, hype, or motivational padding
- unnecessary follow-up questions at the end
`.trim();

const SUMMARY_PROMPT = `
Summarize the uploaded study material for a student who needs a concise revision summary.

Requirements:
- keep the summary under 120 words
- preserve the most important definitions, distinctions, and process steps
- remove filler, repetition, and administrative wording
- write in clear study-guide language
- do not add facts that are not supported by the notes
`.trim();

const CONCEPT_PROMPT = `
Extract the most important learning targets from the study material.

Return valid JSON only:
{
  "concepts": ["Concept 1", "Concept 2"],
  "weakAreas": ["Likely confusion area 1", "Likely confusion area 2"]
}

Rules:
- concepts should be the core topics, terms, processes, or relationships a student should remember
- weakAreas should be likely confusion points, fragile distinctions, or skills that deserve targeted review
- return 4 to 6 concise concepts
- return 2 to 4 concise weak areas
- no markdown fences
`.trim();

function buildFlashcardPrompt(count: number): string {
	return `
Create high-quality study flashcards from the provided learning context.

Return valid JSON only:
{
  "flashcards": [
    {
      "front": "Question or concept",
      "back": "Clear answer"
    }
  ]
}

Rules:
- create exactly ${count} flashcards
- prioritize uploaded study material over general knowledge
- make each front specific, concrete, and useful for active recall
- make each back concise, accurate, and easy to review quickly
- avoid duplicates, vague wording, trivia, or low-value restatements
- no markdown fences
`.trim();
}

function buildQuizPrompt(count: number): string {
	return `
Create multiple-choice quiz questions from the provided learning context.

Return valid JSON only:
{
  "quiz": [
    {
      "question": "...",
      "options": ["A", "B", "C", "D"],
      "answer": "...",
      "explanation": "..."
    }
  ]
}

Rules:
- create exactly ${count} questions
- prioritize uploaded study material over general knowledge
- each question should test understanding, not trivial wording
- each question must have exactly 4 options
- include one clearly correct answer and three plausible distractors
- answer must exactly match one option
- explanation should briefly teach why the correct answer is right and, when useful, why the distractor logic is wrong
- no markdown fences
`.trim();
}

function normalizeText(value: string | null | undefined): string {
	return (value ?? "").replace(/\s+/g, " ").trim();
}

function uniqueNormalized(values: string[] | null | undefined): string[] {
	const seen = new Set<string>();
	const output: string[] = [];

	for (const value of values ?? []) {
		const normalized = normalizeText(value);
		if (!normalized) continue;
		const key = normalized.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		output.push(normalized);
	}

	return output;
}

function stringifyUnknown(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}

	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}

	if (Array.isArray(value)) {
		return value
			.map((item) => stringifyUnknown(item))
			.filter(Boolean)
			.join("\n");
	}

	if (!value || typeof value !== "object") {
		return "";
	}

	const typed = value as Record<string, unknown>;
	const nestedCandidates = [
		typed.text,
		typed.content,
		typed.response,
		typed.output_text,
		typed.generated_text,
		typed.message,
		typed.delta,
		typed.result,
	];

	for (const candidate of nestedCandidates) {
		const text = stringifyUnknown(candidate);
		if (text) {
			return text;
		}
	}

	try {
		return JSON.stringify(value);
	} catch {
		return "";
	}
}

function extractResponseText(response: unknown): string {
	const typed = response as {
		response?: unknown;
		result?: { response?: unknown };
		choices?: Array<{
			message?: { content?: unknown };
			delta?: { content?: unknown };
			text?: unknown;
		}>;
	};

	return normalizeText(
		stringifyUnknown(typed.response) ||
			stringifyUnknown(typed.result?.response) ||
			stringifyUnknown(typed.choices?.[0]?.message?.content) ||
			stringifyUnknown(typed.choices?.[0]?.delta?.content) ||
			stringifyUnknown(typed.choices?.[0]?.text) ||
			stringifyUnknown(response),
	);
}

function stripCodeFences(source: string): string {
	return source
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/i, "")
		.trim();
}

function parseJsonObject<T>(source: string): T | null {
	const cleaned = stripCodeFences(source);
	const firstBrace = cleaned.indexOf("{");
	const lastBrace = cleaned.lastIndexOf("}");

	if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
		return null;
	}

	try {
		return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
	} catch {
		return null;
	}
}

function buildMaterialContext(materials: StudyMaterial[]): string {
	if (materials.length === 0) {
		return "No uploaded study material yet.";
	}

	return materials
		.slice(-3)
		.map((material, index) => {
			const excerpt = material.content.slice(0, 900);
			const summary = material.summary || "Summary pending.";
			const concepts =
				material.concepts.length > 0
					? material.concepts.join(", ")
					: "Concept extraction pending.";

			return [
				`Material ${index + 1}: ${material.title}`,
				`Summary: ${summary}`,
				`Concepts: ${concepts}`,
				`Excerpt: ${excerpt}`,
			].join("\n");
		})
		.join("\n\n");
}

function buildStudyContext(session: StudySession): string {
	const weakAreas =
		session.weakAreas.length > 0
			? `Likely weak areas to reinforce: ${session.weakAreas.join(", ")}.`
			: "No weak areas inferred yet.";

	return `${buildMaterialContext(session.materials)}\n\n${weakAreas}`;
}

export function buildChatMessages(session: StudySession) {
	const systemMessage = `${TUTOR_SYSTEM_PROMPT}\n\nPrimary study context:\n${buildStudyContext(session)}`;

	return [
		{ role: "system" as const, content: systemMessage },
		...trimConversation(session.messages).map((message) => ({
			role: message.role,
			content: message.content,
		})),
	];
}

async function runTextGeneration(
	env: Pick<Env, "AI">,
	messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
	maxTokens: number,
): Promise<string> {
	const response = await env.AI.run(CHAT_MODEL, {
		messages,
		max_tokens: maxTokens,
	});

	return extractResponseText(response);
}

function splitSentences(source: string): string[] {
	return source
		.split(/(?<=[.!?])\s+/)
		.map((sentence) => normalizeText(sentence))
		.filter(Boolean);
}

function fallbackSummary(material: StudyMaterial): string {
	const sentences = splitSentences(material.content);
	return sentences.slice(0, 2).join(" ").slice(0, 240) || material.content.slice(0, 240);
}

function phraseCandidates(source: string): string[] {
	return source
		.split(/[\n,;:.]/)
		.map((part) => normalizeText(part))
		.filter((part) => part.length >= 10)
		.slice(0, 8);
}

function fallbackConcepts(material: StudyMaterial): string[] {
	return uniqueNormalized([
		material.title,
		...phraseCandidates(material.content),
	]).slice(0, 5);
}

function fallbackWeakAreas(concepts: string[]): string[] {
	return uniqueNormalized(
		concepts.slice(0, 3).map((concept) => `Practice explaining ${concept.toLowerCase()}`),
	);
}

export async function summarizeMaterial(
	env: Pick<Env, "AI">,
	material: StudyMaterial,
): Promise<string> {
	try {
		const generatedSummary = await runTextGeneration(
			env,
			[
				{ role: "system", content: SUMMARY_PROMPT },
				{
					role: "user",
					content: `Title: ${material.title}\n\nStudy material:\n${material.content}`,
				},
			],
			220,
		);

		return generatedSummary || fallbackSummary(material);
	} catch (error) {
		console.warn("Falling back to deterministic material summary:", error);
		return fallbackSummary(material);
	}
}

export async function extractConceptsAndWeakAreas(
	env: Pick<Env, "AI">,
	material: StudyMaterial,
): Promise<Pick<MaterialInsights, "concepts" | "weakAreas">> {
	let concepts = fallbackConcepts(material);
	let weakAreas = fallbackWeakAreas(concepts);

	try {
		const generatedConcepts = await runTextGeneration(
			env,
			[
				{ role: "system", content: CONCEPT_PROMPT },
				{
					role: "user",
					content: `Title: ${material.title}\n\nStudy material:\n${material.content}`,
				},
			],
			260,
		);

		const parsed = parseJsonObject<{
			concepts?: string[];
			weakAreas?: string[];
		}>(generatedConcepts);

		if (parsed) {
			concepts = uniqueNormalized(parsed.concepts).slice(0, 6);
			weakAreas = uniqueNormalized(parsed.weakAreas).slice(0, 4);
		}
	} catch (error) {
		console.warn("Falling back to deterministic concept extraction:", error);
	}

	if (concepts.length === 0) {
		concepts = fallbackConcepts(material);
	}

	if (weakAreas.length === 0) {
		weakAreas = fallbackWeakAreas(concepts);
	}

	return {
		concepts,
		weakAreas,
	};
}

export async function generateMaterialInsights(
	env: Pick<Env, "AI">,
	material: StudyMaterial,
): Promise<MaterialInsights> {
	const [summary, extracted] = await Promise.all([
		summarizeMaterial(env, material),
		extractConceptsAndWeakAreas(env, material),
	]);

	return {
		summary: normalizeText(summary),
		concepts: extracted.concepts,
		weakAreas: extracted.weakAreas,
	};
}

function normalizeRequestedCount(count: number | null | undefined): number {
	const numeric = Number.isFinite(count) ? Math.floor(count as number) : 6;
	return Math.max(5, Math.min(10, numeric));
}

function buildGenerationContext(session: StudySession): string {
	const recentMessages = trimConversation(session.messages, 6)
		.filter((message) => message.role === "user")
		.map((message) => `Student question: ${message.content}`)
		.join("\n");

	return [
		`Session title: ${session.title}`,
		`Session summary: ${session.summary || "No summary yet."}`,
		`Weak areas: ${session.weakAreas.join(", ") || "None identified yet."}`,
		`Study materials:\n${buildMaterialContext(session.materials)}`,
		recentMessages ? `Recent chat:\n${recentMessages}` : "",
	]
		.filter(Boolean)
		.join("\n\n");
}

function validateFlashcards(payload: FlashcardsResponse | null, count: number): Flashcard[] {
	return (payload?.flashcards ?? [])
		.map((card) => ({
			front: normalizeText(card.front),
			back: normalizeText(card.back),
		}))
		.filter((card) => card.front && card.back)
		.slice(0, count);
}

function fallbackFlashcards(session: StudySession, count: number): Flashcard[] {
	const concepts = uniqueNormalized([
		...session.materials.flatMap((material) => material.concepts),
		...session.weakAreas,
	]).slice(0, count);

	if (concepts.length === 0) {
		return [
			{
				front: "What should you add first to improve this study session?",
				back: "Paste notes or ask a topic question so the coach has material to teach from.",
			},
		];
	}

	return concepts.map((concept) => ({
		front: `Explain ${concept}.`,
		back:
			session.materials.find((material) =>
				material.concepts.some((item) => item.toLowerCase() === concept.toLowerCase()),
			)?.summary || `Review the notes connected to ${concept} and restate it in your own words.`,
	}));
}

function validateQuiz(payload: QuizResponse | null, count: number): QuizQuestion[] {
	return (payload?.quiz ?? [])
		.map((item) => ({
			question: normalizeText(item.question),
			options: uniqueNormalized(item.options).slice(0, 4),
			answer: normalizeText(item.answer),
			explanation: normalizeText(item.explanation),
		}))
		.filter(
			(item) =>
				item.question &&
				item.options.length === 4 &&
				item.answer &&
				item.explanation &&
				item.options.includes(item.answer),
		)
		.slice(0, count);
}

function fallbackQuiz(session: StudySession, count: number): QuizQuestion[] {
	const concepts = uniqueNormalized([
		...session.materials.flatMap((material) => material.concepts),
		...session.weakAreas,
	]).slice(0, count);

	if (concepts.length === 0) {
		return [
			{
				question: "What helps AI Learning Coach give the best answers?",
				options: [
					"Uploading or pasting study material",
					"Refreshing the page repeatedly",
					"Only asking yes/no questions",
					"Avoiding topic-specific vocabulary",
				],
				answer: "Uploading or pasting study material",
				explanation:
					"The app is designed to prioritize uploaded notes as the primary study context.",
			},
		];
	}

	return concepts.map((concept) => ({
		question: `Which topic should you review if you are struggling with ${concept.toLowerCase()}?`,
		options: [
			concept,
			"An unrelated historical anecdote",
			"A generic productivity hack",
			"A random vocabulary list",
		],
		answer: concept,
		explanation: `The quiz targets ${concept} because it appears in the uploaded study context or inferred weak areas.`,
	}));
}

export async function generateFlashcards(
	env: Pick<Env, "AI">,
	session: StudySession,
	requestedCount?: number,
): Promise<FlashcardsResponse> {
	const count = normalizeRequestedCount(requestedCount);
	const fallback = fallbackFlashcards(session, count);

	try {
		const response = await runTextGeneration(
			env,
			[
				{
					role: "system",
					content: buildFlashcardPrompt(count),
				},
				{
					role: "user",
					content: buildGenerationContext(session),
				},
			],
			700,
		);

		const parsed = parseJsonObject<FlashcardsResponse>(response);
		const flashcards = validateFlashcards(parsed, count);

		return {
			flashcards: flashcards.length > 0 ? flashcards : fallback,
		};
	} catch (error) {
		console.warn("Falling back to deterministic flashcards:", error);
		return { flashcards: fallback };
	}
}

export async function generateQuiz(
	env: Pick<Env, "AI">,
	session: StudySession,
	requestedCount?: number,
): Promise<QuizResponse> {
	const count = normalizeRequestedCount(requestedCount);
	const fallback = fallbackQuiz(session, count);

	try {
		const response = await runTextGeneration(
			env,
			[
				{
					role: "system",
					content: buildQuizPrompt(count),
				},
				{
					role: "user",
					content: buildGenerationContext(session),
				},
			],
			900,
		);

		const parsed = parseJsonObject<QuizResponse>(response);
		const quiz = validateQuiz(parsed, count);

		return {
			quiz: quiz.length > 0 ? quiz : fallback,
		};
	} catch (error) {
		console.warn("Falling back to deterministic quiz generation:", error);
		return { quiz: fallback };
	}
}
