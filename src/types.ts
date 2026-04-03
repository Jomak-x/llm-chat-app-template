export interface Env {
	AI: Ai;
	LEARNING_SESSIONS: DurableObjectNamespace;
	MATERIAL_INGESTION_WORKFLOW: Workflow<MaterialIngestionWorkflowParams>;
	CORS_ORIGIN?: string;
}

export interface SessionMessage {
	role: "user" | "assistant";
	content: string;
	timestamp: string;
}

export interface StudyMaterial {
	id: string;
	title: string;
	content: string;
	summary: string;
	concepts: string[];
	createdAt: string;
	updatedAt: string;
}

export interface Flashcard {
	front: string;
	back: string;
}

export interface QuizQuestion {
	question: string;
	options: string[];
	answer: string;
	explanation: string;
}

export interface WorkflowStatus {
	status: "idle" | "running" | "complete" | "errored";
	workflowId: string | null;
	materialId: string | null;
	error: string | null;
	updatedAt: string | null;
}

export interface StudySession {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
	materials: StudyMaterial[];
	messages: SessionMessage[];
	flashcards: Flashcard[];
	quizzes: QuizQuestion[];
	summary: string;
	weakAreas: string[];
	workflowStatus: WorkflowStatus;
}

export interface MaterialInsights {
	summary: string;
	concepts: string[];
	weakAreas: string[];
}

export interface MaterialIngestionWorkflowParams {
	sessionId: string;
	materialId: string;
	workflowId: string;
}

export interface FlashcardsResponse {
	flashcards: Flashcard[];
}

export interface QuizResponse {
	quiz: QuizQuestion[];
}
