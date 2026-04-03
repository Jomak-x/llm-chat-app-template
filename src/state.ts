import {
	type Flashcard,
	type MaterialInsights,
	type QuizQuestion,
	type SessionMessage,
	type StudyMaterial,
	type StudySession,
	type WorkflowStatus,
} from "./types";

export const STATE_KEY = "learning-coach-session";
export const DEFAULT_SESSION_TITLE = "New study session";
export const INITIAL_ASSISTANT_MESSAGE =
	"Share a topic or paste class notes, and I'll help you study with concise explanations, flashcards, and practice questions.";

function nowIso(): string {
	return new Date().toISOString();
}

function normalizeText(value: string | null | undefined): string {
	return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeRichText(value: string | null | undefined): string {
	return (value ?? "")
		.replace(/\r/g, "")
		.replace(/[^\S\n]+/g, " ")
		.replace(/ *\n */g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
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

function createWorkflowStatus(
	overrides?: Partial<WorkflowStatus>,
): WorkflowStatus {
	return {
		status: "idle",
		workflowId: null,
		materialId: null,
		error: null,
		updatedAt: null,
		...overrides,
	};
}

function summarizeTitle(source: string, fallback = DEFAULT_SESSION_TITLE): string {
	const cleaned = normalizeText(source).replace(/[^\w\s:-]/g, "");
	if (!cleaned) {
		return fallback;
	}

	const words = cleaned.split(/\s+/).slice(0, 6);
	return words.join(" ");
}

function deriveSessionTitle(
	currentTitle: string,
	materials: StudyMaterial[],
	messages: SessionMessage[],
): string {
	const materialTitle = materials[0]?.title;
	if (materialTitle) {
		return summarizeTitle(materialTitle, DEFAULT_SESSION_TITLE);
	}

	if (currentTitle && currentTitle !== DEFAULT_SESSION_TITLE) {
		return summarizeTitle(currentTitle, DEFAULT_SESSION_TITLE);
	}

	const firstUserMessage = messages.find((message) => message.role === "user")?.content;
	return summarizeTitle(firstUserMessage ?? "", DEFAULT_SESSION_TITLE);
}

function buildSessionSummary(materials: StudyMaterial[]): string {
	return materials
		.map((material) => normalizeText(material.summary))
		.filter(Boolean)
		.slice(-2)
		.join(" ");
}

function normalizeFlashcards(cards: Flashcard[] | null | undefined): Flashcard[] {
	return (cards ?? [])
		.map((card) => ({
			front: normalizeText(card.front),
			back: normalizeText(card.back),
		}))
		.filter((card) => card.front && card.back);
}

function normalizeQuiz(quiz: QuizQuestion[] | null | undefined): QuizQuestion[] {
	return (quiz ?? [])
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
		);
}

function withUpdatedAt(state: StudySession): StudySession {
	return {
		...state,
		title: deriveSessionTitle(state.title, state.materials, state.messages),
		summary: buildSessionSummary(state.materials),
		updatedAt: nowIso(),
	};
}

export function createSessionState(sessionId: string): StudySession {
	const timestamp = nowIso();

	return {
		id: sessionId,
		title: DEFAULT_SESSION_TITLE,
		createdAt: timestamp,
		updatedAt: timestamp,
		materials: [],
		messages: [
			{
				role: "assistant",
				content: INITIAL_ASSISTANT_MESSAGE,
				timestamp,
			},
		],
		flashcards: [],
		quizzes: [],
		summary: "",
		weakAreas: [],
		workflowStatus: createWorkflowStatus(),
	};
}

export function appendUserMessage(
	state: StudySession,
	content: string,
): StudySession {
	const normalized = normalizeRichText(content);
	if (!normalized) {
		return state;
	}

	return withUpdatedAt({
		...state,
		messages: [
			...state.messages,
			{
				role: "user",
				content: normalized,
				timestamp: nowIso(),
			},
		],
	});
}

export function appendAssistantMessage(
	state: StudySession,
	content: string,
): StudySession {
	const normalized = normalizeRichText(content);
	if (!normalized) {
		return state;
	}

	return withUpdatedAt({
		...state,
		messages: [
			...state.messages,
			{
				role: "assistant",
				content: normalized,
				timestamp: nowIso(),
			},
		],
	});
}

export function addMaterial(
	state: StudySession,
	input: { id?: string; title?: string; content: string },
): { state: StudySession; material: StudyMaterial } {
	const content = normalizeRichText(input.content);
	if (!content) {
		return {
			state,
			material: {
				id: input.id ?? crypto.randomUUID(),
				title: "Study Notes",
				content: "",
				summary: "",
				concepts: [],
				createdAt: nowIso(),
				updatedAt: nowIso(),
			},
		};
	}

	const timestamp = nowIso();
	const title = summarizeTitle(input.title ?? content.split(/[.!?\n]/)[0] ?? "", "Study Notes");
	const material: StudyMaterial = {
		id: input.id ?? crypto.randomUUID(),
		title,
		content,
		summary: "",
		concepts: [],
		createdAt: timestamp,
		updatedAt: timestamp,
	};

	return {
		material,
		state: withUpdatedAt({
			...state,
			materials: [...state.materials, material],
			flashcards: [],
			quizzes: [],
		}),
	};
}

export function markWorkflowRunning(
	state: StudySession,
	workflowId: string,
	materialId: string,
): StudySession {
	return withUpdatedAt({
		...state,
		workflowStatus: createWorkflowStatus({
			status: "running",
			workflowId: normalizeText(workflowId) || null,
			materialId: normalizeText(materialId) || null,
			error: null,
			updatedAt: nowIso(),
		}),
	});
}

export function applyMaterialInsights(
	state: StudySession,
	workflowId: string,
	materialId: string,
	insights: MaterialInsights,
): StudySession {
	const materialExists = state.materials.some((material) => material.id === materialId);
	if (!materialExists) {
		return state;
	}

	const updatedMaterials = state.materials.map((material) =>
		material.id === materialId
			? {
					...material,
					summary: normalizeText(insights.summary),
					concepts: uniqueNormalized(insights.concepts),
					updatedAt: nowIso(),
				}
			: material,
	);

	const nextState = withUpdatedAt({
		...state,
		materials: updatedMaterials,
		weakAreas: uniqueNormalized([...state.weakAreas, ...(insights.weakAreas ?? [])]),
		workflowStatus:
			state.workflowStatus.workflowId === workflowId &&
			state.workflowStatus.materialId === materialId
				? createWorkflowStatus({
						status: "complete",
						workflowId,
						materialId,
						error: null,
						updatedAt: nowIso(),
					})
				: state.workflowStatus,
	});

	return nextState;
}

export function failWorkflow(
	state: StudySession,
	workflowId: string,
	materialId: string,
	error: string,
): StudySession {
	if (
		state.workflowStatus.workflowId !== workflowId ||
		state.workflowStatus.materialId !== materialId
	) {
		return state;
	}

	return withUpdatedAt({
		...state,
		workflowStatus: createWorkflowStatus({
			status: "errored",
			workflowId,
			materialId,
			error: normalizeText(error) || "Material ingestion failed.",
			updatedAt: nowIso(),
		}),
	});
}

export function saveFlashcards(
	state: StudySession,
	flashcards: Flashcard[],
): StudySession {
	return withUpdatedAt({
		...state,
		flashcards: normalizeFlashcards(flashcards),
	});
}

export function saveQuiz(
	state: StudySession,
	quiz: QuizQuestion[],
): StudySession {
	return withUpdatedAt({
		...state,
		quizzes: normalizeQuiz(quiz),
	});
}

export function trimConversation(
	messages: SessionMessage[],
	limit = 14,
): SessionMessage[] {
	return messages.filter((message) => normalizeRichText(message.content)).slice(-limit);
}
