import { describe, expect, it } from "vitest";
import {
	DEFAULT_SESSION_TITLE,
	addMaterial,
	appendAssistantMessage,
	appendUserMessage,
	applyMaterialInsights,
	createSessionState,
	failWorkflow,
	markWorkflowRunning,
	saveFlashcards,
	saveQuiz,
} from "../src/state";

describe("study session state", () => {
	it("creates a fresh session with a welcome message and empty study artifacts", () => {
		const session = createSessionState("session-1");

		expect(session.id).toBe("session-1");
		expect(session.title).toBe(DEFAULT_SESSION_TITLE);
		expect(session.messages).toHaveLength(1);
		expect(session.materials).toEqual([]);
		expect(session.flashcards).toEqual([]);
		expect(session.quizzes).toEqual([]);
		expect(session.workflowStatus.status).toBe("idle");
	});

	it("stores user and assistant messages and derives a useful title", () => {
		const withQuestion = appendUserMessage(
			createSessionState("session-2"),
			"Can you explain the Krebs cycle in simpler words?",
		);
		const completed = appendAssistantMessage(
			withQuestion,
			"The Krebs cycle releases stored energy by oxidizing acetyl-CoA in the mitochondria.",
		);

		expect(completed.messages).toHaveLength(3);
		expect(completed.title).toBe("Can you explain the Krebs cycle");
		expect(completed.messages.at(-1)?.role).toBe("assistant");
	});

	it("preserves line breaks in assistant messages for readable markdown output", () => {
		const completed = appendAssistantMessage(
			createSessionState("session-2b"),
			"Direct answer:\n- Step one\n- Step two\n\nMemory tip:\nUse PMAT.",
		);

		expect(completed.messages.at(-1)?.content).toContain("\n- Step one");
		expect(completed.messages.at(-1)?.content).toContain("\n\nMemory tip:");
	});

	it("adds material, clears prior generated artifacts, and stores normalized content", () => {
		const base = saveFlashcards(
			saveQuiz(createSessionState("session-3"), [
				{
					question: "Old question",
					options: ["A", "B", "C", "D"],
					answer: "A",
					explanation: "Old explanation",
				},
			]),
			[{ front: "Old front", back: "Old back" }],
		);

		const result = addMaterial(base, {
			id: "mat-1",
			title: "Lecture 6 Notes",
			content: "Photosynthesis stores energy in glucose. Light-dependent reactions happen in the thylakoid membrane.",
		});

		expect(result.material.id).toBe("mat-1");
		expect(result.state.materials).toHaveLength(1);
		expect(result.state.materials[0]?.title).toBe("Lecture 6 Notes");
		expect(result.state.flashcards).toEqual([]);
		expect(result.state.quizzes).toEqual([]);
	});

	it("tracks workflow progress and persists insights onto the matching material", () => {
		const added = addMaterial(createSessionState("session-4"), {
			id: "mat-2",
			title: "Cell division review",
			content: "Mitosis creates two identical daughter cells through prophase, metaphase, anaphase, and telophase.",
		}).state;
		const running = markWorkflowRunning(added, "wf-1", "mat-2");
		const completed = applyMaterialInsights(running, "wf-1", "mat-2", {
			summary: "Mitosis makes two identical daughter cells through four ordered phases.",
			concepts: ["Mitosis", "Daughter cells", "Cell cycle phases"],
			weakAreas: ["Ordering mitosis phases"],
		});

		expect(completed.workflowStatus.status).toBe("complete");
		expect(completed.materials[0]?.summary).toContain("Mitosis makes two identical");
		expect(completed.materials[0]?.concepts).toContain("Mitosis");
		expect(completed.weakAreas).toContain("Ordering mitosis phases");
		expect(completed.summary).toContain("Mitosis makes two identical");
	});

	it("ignores stale workflow completions and records matching failures", () => {
		const added = addMaterial(createSessionState("session-5"), {
			id: "mat-3",
			content: "Momentum equals mass times velocity.",
		}).state;
		const running = markWorkflowRunning(added, "wf-2", "mat-3");
		const stale = applyMaterialInsights(running, "wf-x", "missing-material", {
			summary: "Should not apply",
			concepts: ["Bad"],
			weakAreas: ["Bad"],
		});
		const failed = failWorkflow(running, "wf-2", "mat-3", "Workers AI timeout");

		expect(stale.materials[0]?.summary).toBe("");
		expect(failed.workflowStatus.status).toBe("errored");
		expect(failed.workflowStatus.error).toContain("timeout");
	});

	it("still applies earlier ingestion results to the correct material after a newer upload starts", () => {
		const firstAdded = addMaterial(createSessionState("session-7"), {
			id: "mat-a",
			title: "First notes",
			content: "Potential energy is stored energy.",
		}).state;
		const secondAdded = addMaterial(firstAdded, {
			id: "mat-b",
			title: "Second notes",
			content: "Kinetic energy is energy of motion.",
		}).state;
		const runningLatest = markWorkflowRunning(secondAdded, "wf-b", "mat-b");
		const firstCompleted = applyMaterialInsights(runningLatest, "wf-a", "mat-a", {
			summary: "Potential energy is stored energy.",
			concepts: ["Potential energy"],
			weakAreas: ["Comparing potential and kinetic energy"],
		});

		expect(firstCompleted.materials.find((material) => material.id === "mat-a")?.summary).toBe(
			"Potential energy is stored energy.",
		);
		expect(firstCompleted.workflowStatus.status).toBe("running");
		expect(firstCompleted.workflowStatus.materialId).toBe("mat-b");
	});

	it("saves normalized flashcards and quiz questions", () => {
		const withFlashcards = saveFlashcards(createSessionState("session-6"), [
			{ front: "  What is osmosis? ", back: " Movement of water across a membrane " },
			{ front: "", back: "invalid" },
		]);
		const withQuiz = saveQuiz(withFlashcards, [
			{
				question: "Which organelle produces ATP?",
				options: ["Mitochondria", "Golgi apparatus", "Ribosome", "Vacuole"],
				answer: "Mitochondria",
				explanation: "ATP production primarily happens in mitochondria.",
			},
			{
				question: "Invalid",
				options: ["One"],
				answer: "One",
				explanation: "Bad",
			},
		]);

		expect(withQuiz.flashcards).toEqual([
			{ front: "What is osmosis?", back: "Movement of water across a membrane" },
		]);
		expect(withQuiz.quizzes).toHaveLength(1);
		expect(withQuiz.quizzes[0]?.answer).toBe("Mitochondria");
	});
});
