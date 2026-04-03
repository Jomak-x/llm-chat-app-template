import {
	startTransition,
	useEffect,
	useRef,
	useState,
	type ChangeEvent,
	type ReactNode,
} from "react";
import {
	Brain,
	CheckCircle2,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	FileText,
	HelpCircle,
	GraduationCap,
	Layers3,
	MessageSquareMore,
	MessagesSquare,
	MoonStar,
	PenSquare,
	ShieldCheck,
	Sparkles,
	SunMedium,
} from "lucide-react";
import { MarkdownContent } from "./components/MarkdownContent";
import type {
	ApiErrorResponse,
	RecentSession,
	StudyMaterial,
	StudySession,
} from "./lib/types";

const RECENT_SESSIONS_KEY = "learning-coach-recent-sessions";
const THEME_STORAGE_KEY = "learning-coach-theme";
const POLL_INTERVAL_MS = 2200;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";
const SUPPORTED_UPLOAD_EXTENSIONS = [".txt", ".md", ".markdown", ".csv", ".tsv", ".json"];
const FILE_ACCEPT_VALUE = ".txt,.md,.markdown,.csv,.tsv,.json,text/plain,text/markdown,text/csv,application/json";

type PanelKey = "materials" | "flashcards" | "quiz";
type ThemeMode = "light" | "dark";

export default function App() {
	const chatScrollRef = useRef<HTMLDivElement | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const pendingAssistantMessageRef = useRef("");
	const renderFrameRef = useRef<number | null>(null);
	const activeSessionIdRef = useRef<string | null>(null);

	const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
	const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
	const [session, setSession] = useState<StudySession | null>(null);
	const [chatDraft, setChatDraft] = useState("");
	const [materialTitle, setMaterialTitle] = useState("");
	const [materialDraft, setMaterialDraft] = useState("");
	const [selectedFileName, setSelectedFileName] = useState("");
	const [activePanel, setActivePanel] = useState<PanelKey>("materials");
	const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
	const [pendingAssistantMessage, setPendingAssistantMessage] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
	const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
	const [revealedFlashcards, setRevealedFlashcards] = useState<Record<number, boolean>>({});
	const [quizSelections, setQuizSelections] = useState<Record<number, string>>({});
	const [revealedQuizItems, setRevealedQuizItems] = useState<Record<number, boolean>>({});
	const [isCreatingSession, setIsCreatingSession] = useState(true);
	const [isSending, setIsSending] = useState(false);
	const [isUploadingMaterial, setIsUploadingMaterial] = useState(false);
	const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);
	const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);

	useEffect(() => {
		const savedSessions = loadRecentSessions();
		setRecentSessions(savedSessions);
		void bootstrapSession(savedSessions);

		return () => {
			if (renderFrameRef.current !== null) {
				window.cancelAnimationFrame(renderFrameRef.current);
			}
		};
	}, []);

	useEffect(() => {
		document.body.dataset.theme = theme;
		document.body.style.colorScheme = theme;
		window.localStorage.setItem(THEME_STORAGE_KEY, theme);
	}, [theme]);

	useEffect(() => {
		if (!session) {
			return;
		}

		setRecentSessions((previous) => {
			const next = upsertRecentSession(previous, session);
			saveRecentSessions(next);
			return next;
		});
	}, [session?.id, session?.title, session?.updatedAt]);

	useEffect(() => {
		setRevealedFlashcards({});
		setQuizSelections({});
		setRevealedQuizItems({});
		setCurrentFlashcardIndex(0);
		setCurrentQuizIndex(0);
	}, [session?.id, session?.flashcards.length, session?.quizzes.length]);

	useEffect(() => {
		activeSessionIdRef.current = currentSessionId;
	}, [currentSessionId]);

	useEffect(() => {
		if (session?.workflowStatus.status !== "running" || !currentSessionId) {
			return;
		}

		const handle = window.setInterval(() => {
			void refreshSession(currentSessionId);
		}, POLL_INTERVAL_MS);

		return () => window.clearInterval(handle);
	}, [currentSessionId, session?.workflowStatus.status]);

	useEffect(() => {
		const container = chatScrollRef.current;
		if (!container) {
			return;
		}

		container.scrollTop = container.scrollHeight;
	}, [session?.messages, pendingAssistantMessage]);

	async function bootstrapSession(savedSessions: RecentSession[]) {
		if (savedSessions.length > 0) {
			const first = savedSessions[0];
			const loaded = await fetchSession(first.id).catch(() => null);
			if (loaded) {
				setCurrentSessionId(first.id);
				setSession(loaded);
				setIsCreatingSession(false);
				return;
			}
		}

		await createSession();
	}

	async function createSession() {
		setErrorMessage(null);
		setIsCreatingSession(true);

		try {
			const response = await fetch(apiUrl("/api/session"), {
				method: "POST",
			});
			if (!response.ok) {
				throw new Error("Failed to create a study session.");
			}

			const created = (await response.json()) as StudySession;
			startTransition(() => {
				setCurrentSessionId(created.id);
				setSession(created);
				setActivePanel("materials");
				setPendingAssistantMessage(null);
				setChatDraft("");
				setMaterialTitle("");
				setMaterialDraft("");
				setSelectedFileName("");
				setCurrentFlashcardIndex(0);
				setCurrentQuizIndex(0);
				setRevealedFlashcards({});
				setQuizSelections({});
				setRevealedQuizItems({});
			});
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Failed to create a study session.");
		} finally {
			setIsCreatingSession(false);
		}
	}

	async function fetchSession(sessionId: string): Promise<StudySession> {
		const response = await fetch(apiUrl(`/api/session/${sessionId}`));
		if (!response.ok) {
			throw new Error("Failed to load the session.");
		}

		return (await response.json()) as StudySession;
	}

	async function refreshSession(sessionId: string) {
		try {
			const loaded = await fetchSession(sessionId);
			if (
				activeSessionIdRef.current !== null &&
				loaded.id !== activeSessionIdRef.current
			) {
				return;
			}
			startTransition(() => setSession(loaded));
		} catch (error) {
			console.error(error);
		}
	}

	async function openSession(sessionId: string) {
		setErrorMessage(null);

		try {
			const loaded = await fetchSession(sessionId);
			startTransition(() => {
				setCurrentSessionId(sessionId);
				setSession(loaded);
				setPendingAssistantMessage(null);
				setSelectedFileName("");
				setCurrentFlashcardIndex(0);
				setCurrentQuizIndex(0);
				setRevealedFlashcards({});
				setQuizSelections({});
				setRevealedQuizItems({});
			});
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Failed to open the session.");
		}
	}

	async function sendMessage() {
		if (!currentSessionId || !chatDraft.trim() || isSending) {
			return;
		}

		const message = chatDraft.trim();
		const activeSessionId = currentSessionId;
		setIsSending(true);
		setErrorMessage(null);
		setChatDraft("");
		pendingAssistantMessageRef.current = "";
		setPendingAssistantMessage("");

		startTransition(() => {
			setSession((previous) =>
				previous
					? {
							...previous,
							messages: [
								...previous.messages,
								{
									role: "user",
									content: message,
									timestamp: new Date().toISOString(),
								},
							],
							updatedAt: new Date().toISOString(),
						}
					: previous,
			);
		});

		try {
			const response = await fetch(apiUrl(`/api/session/${activeSessionId}/chat`), {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ message }),
			});

			if (!response.ok || !response.body) {
				const payload = (await safeJson(response)) as ApiErrorResponse | null;
				throw new Error(payload?.error || "Failed to start the tutor response.");
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					const parsed = consumeSseEvents(`${buffer}\n\n`);
					applySseEvents(parsed.events, activeSessionId);
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const parsed = consumeSseEvents(buffer);
				buffer = parsed.buffer;
				const sawDone = applySseEvents(parsed.events, activeSessionId);
				if (sawDone) {
					break;
				}
			}
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Failed to send message.");
		} finally {
			setIsSending(false);
			pendingAssistantMessageRef.current = "";
			setPendingAssistantMessage(null);
		}
	}

	function applySseEvents(events: string[], expectedSessionId: string): boolean {
		let sawDone = false;

		for (const data of events) {
			if (data === "[DONE]") {
				sawDone = true;
				break;
			}

			try {
				const parsed = JSON.parse(data) as {
					response?: string;
					session?: StudySession;
				};

				if (
					typeof parsed.response === "string" &&
					activeSessionIdRef.current === expectedSessionId
				) {
					queueAssistantChunk(parsed.response);
				}

				const sessionPayload = parsed.session ?? null;
				if (sessionPayload && activeSessionIdRef.current === expectedSessionId) {
					pendingAssistantMessageRef.current = "";
					startTransition(() => {
						setSession(sessionPayload);
						setPendingAssistantMessage(null);
					});
				}
			} catch (error) {
				console.error("Failed to parse SSE event", error);
			}
		}

		return sawDone;
	}

	function queueAssistantChunk(chunk: string) {
		pendingAssistantMessageRef.current += chunk;
		if (renderFrameRef.current !== null) {
			return;
		}

		renderFrameRef.current = window.requestAnimationFrame(() => {
			startTransition(() => {
				setPendingAssistantMessage(pendingAssistantMessageRef.current);
			});
			renderFrameRef.current = null;
		});
	}

	async function addMaterial() {
		if (!currentSessionId || !materialDraft.trim() || isUploadingMaterial) {
			return;
		}

		setIsUploadingMaterial(true);
		setErrorMessage(null);
		setActivePanel("materials");

		try {
			const response = await fetch(apiUrl(`/api/session/${currentSessionId}/material`), {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					title: materialTitle,
					content: materialDraft,
				}),
			});

			if (!response.ok) {
				const payload = (await safeJson(response)) as ApiErrorResponse | null;
				throw new Error(payload?.error || "Failed to add study material.");
			}

			const updated = (await response.json()) as StudySession;
			startTransition(() => {
				setSession(updated);
				setMaterialDraft("");
				setMaterialTitle("");
				setSelectedFileName("");
			});
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Failed to add study material.");
		} finally {
			setIsUploadingMaterial(false);
		}
	}

	async function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) {
			setSelectedFileName("");
			return;
		}

		if (!isSupportedUploadFile(file)) {
			setSelectedFileName("");
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
			setErrorMessage(
				`Unsupported file type. Use ${SUPPORTED_UPLOAD_EXTENSIONS.join(", ")} or another text-based note file.`,
			);
			return;
		}

		try {
			const text = await file.text();
			setSelectedFileName(file.name);
			setMaterialDraft((previous) =>
				previous.trim() ? `${previous.trim()}\n\n${text.trim()}` : text.trim(),
			);
			if (!materialTitle.trim()) {
				setMaterialTitle(file.name.replace(/\.[^.]+$/u, ""));
			}
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Failed to read the selected file.");
		}
	}

	async function buildFlashcards() {
		if (!currentSessionId || isGeneratingFlashcards) {
			return;
		}

		setIsGeneratingFlashcards(true);
		setErrorMessage(null);
		setActivePanel("flashcards");

		try {
			const response = await fetch(apiUrl(`/api/session/${currentSessionId}/flashcards`), {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ count: 6 }),
			});
			if (!response.ok) {
				const payload = (await safeJson(response)) as ApiErrorResponse | null;
				throw new Error(payload?.error || "Failed to generate flashcards.");
			}

			const payload = (await response.json()) as { session: StudySession };
			startTransition(() => {
				setSession(payload.session);
				setCurrentFlashcardIndex(0);
				setRevealedFlashcards({});
			});
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Failed to generate flashcards.");
		} finally {
			setIsGeneratingFlashcards(false);
		}
	}

	async function buildQuiz() {
		if (!currentSessionId || isGeneratingQuiz) {
			return;
		}

		setIsGeneratingQuiz(true);
		setErrorMessage(null);
		setActivePanel("quiz");

		try {
			const response = await fetch(apiUrl(`/api/session/${currentSessionId}/quiz`), {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ count: 5 }),
			});
			if (!response.ok) {
				const payload = (await safeJson(response)) as ApiErrorResponse | null;
				throw new Error(payload?.error || "Failed to generate a quiz.");
			}

			const payload = (await response.json()) as { session: StudySession };
			startTransition(() => {
				setSession(payload.session);
				setCurrentQuizIndex(0);
				setQuizSelections({});
				setRevealedQuizItems({});
			});
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Failed to generate a quiz.");
		} finally {
			setIsGeneratingQuiz(false);
		}
	}

	const themeToggleLabel = theme === "light" ? "Switch to dark mode" : "Switch to light mode";
	const flashcardCount = session?.flashcards.length ?? 0;
	const quizCount = session?.quizzes.length ?? 0;
	const activeFlashcard =
		flashcardCount > 0 ? session?.flashcards[Math.min(currentFlashcardIndex, flashcardCount - 1)] : null;
	const activeQuiz =
		quizCount > 0 ? session?.quizzes[Math.min(currentQuizIndex, quizCount - 1)] : null;

	if (isCreatingSession && !session) {
		return (
			<div className="app-shell">
				<div className="loading-card">Preparing AI Learning Coach...</div>
			</div>
		);
	}

	return (
		<div className="app-shell">
			<div className="workspace-grid">
				<aside className="sidebar-card">
					<div className="space-y-6">
						<div className="flex items-start justify-between gap-3">
							<div className="section-chip">Cloudflare AI Internship Demo</div>
							<button
								type="button"
								className="theme-toggle"
								onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
								aria-label={themeToggleLabel}
								title={themeToggleLabel}
							>
								{theme === "light" ? <MoonStar className="size-4" /> : <SunMedium className="size-4" />}
							</button>
						</div>

						<div className="space-y-3">
							<h1 className="font-serif text-[2.2rem] leading-[1.02] tracking-[-0.03em] text-[var(--text-primary)]">
								AI Learning Coach
							</h1>
							<p className="max-w-[24rem] text-sm leading-7 text-[var(--text-muted)]">
								A focused study workspace built around your own notes, concise tutoring, and active recall.
							</p>
						</div>

						<button className="primary-button w-full" type="button" onClick={() => void createSession()}>
							<PenSquare className="size-4" /> New Session
						</button>

						<div className="space-y-3">
							<div className="label-row">Recent sessions</div>
							<div className="space-y-2">
								{recentSessions.map((item) => (
									<button
										key={item.id}
										type="button"
										onClick={() => void openSession(item.id)}
										className={`session-button ${item.id === currentSessionId ? "session-button-active" : ""}`}
									>
										<span className="block text-sm font-semibold text-[var(--text-primary)]">{item.title}</span>
										<span className="mt-1 block text-xs text-[var(--text-muted)]">
											Updated {formatTimestamp(item.updatedAt)}
										</span>
									</button>
								))}
							</div>
						</div>

						<div className="sidebar-note">
							<div className="label-row">Built on Cloudflare</div>
							<div className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
								<BadgeRow icon={<Brain className="size-4" />} label="Workers AI tutor + generators" />
								<BadgeRow icon={<Layers3 className="size-4" />} label="Workflow-backed note ingestion" />
								<BadgeRow icon={<MessagesSquare className="size-4" />} label="Pages chat interface" />
								<BadgeRow icon={<ShieldCheck className="size-4" />} label="Durable Object memory" />
							</div>
						</div>
					</div>
				</aside>

				<main className="main-card">
					<header className="workspace-header">
						<div className="space-y-3">
							<div className="section-chip">Tutor workspace</div>
							<div className="space-y-2">
								<h2 className="font-serif text-[clamp(1.75rem,2.45vw,2.45rem)] leading-[1.04] tracking-[-0.04em] text-[var(--text-primary)]">
									Study from your own material first.
								</h2>
								<p className="max-w-2xl text-sm leading-7 text-[var(--text-muted)]">
									Upload notes, ask focused questions, then turn the same session into flashcards and quiz practice without losing context.
								</p>
							</div>
						</div>

						<div className="badge-cloud">
							{["Pages", "Worker API", "Workers AI", "Durable Objects", "Workflow"].map((item) => (
								<span key={item} className="chip-pill">
									{item}
								</span>
							))}
						</div>
					</header>

					<div className="overview-strip">
						<div className="overview-item">
							<span className="label-row">Mode</span>
							<span className="overview-value">
								{session?.materials.length ? "Using notes first" : "General tutor mode"}
							</span>
						</div>
						<div className="overview-item">
							<span className="label-row">Materials</span>
							<span className="overview-value">{session?.materials.length ?? 0}</span>
						</div>
						<div className="overview-item">
							<span className="label-row">Flashcards</span>
							<span className="overview-value">{session?.flashcards.length ?? 0}</span>
						</div>
						<div className="overview-item">
							<span className="label-row">Quiz</span>
							<span className="overview-value">{session?.quizzes.length ?? 0}</span>
						</div>
					</div>

					{errorMessage ? <div className="status-banner">{errorMessage}</div> : null}

					<div className="composer-card composer-card-priority">
						<div className="flex items-start justify-between gap-4">
							<div>
								<label className="label-row" htmlFor="chat-input">
									Ask the coach
								</label>
								<p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
									Ask for simpler explanations, quiz prep, or help connecting ideas across your notes.
								</p>
							</div>
							<div className="inline-flex items-center gap-2 rounded-full border border-[var(--line-strong)] bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
								<MessageSquareMore className="size-3.5" /> Tutor chat
							</div>
						</div>

						<textarea
							id="chat-input"
							value={chatDraft}
							onChange={(event) => setChatDraft(event.target.value)}
							placeholder="Ask about a concept, request a simpler explanation, or use your uploaded notes..."
							className="input-area min-h-[132px]"
						/>

						<div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<p className="text-sm text-[var(--text-muted)]">
								{session?.materials.length
									? "Uploaded notes are the primary context for answers."
									: "No notes yet. You can still chat right away, and uploaded material will make answers stronger."}
							</p>
							<button
								type="button"
								className="primary-button"
								onClick={() => void sendMessage()}
								disabled={isSending || !chatDraft.trim()}
							>
								{isSending ? "Sending..." : "Send"}
							</button>
						</div>
					</div>

					<div ref={chatScrollRef} className="chat-log" aria-label="Tutor conversation">
						{session?.messages.length ? (
							session.messages.map((message, index) => (
								<MessageBubble
									key={`${message.timestamp}-${index}`}
									role={message.role}
									content={message.content}
								/>
							))
						) : (
							<ChatEmptyState hasMaterials={Boolean(session?.materials.length)} />
						)}

						{pendingAssistantMessage ? (
							<MessageBubble role="assistant" content={pendingAssistantMessage} pending />
						) : null}
					</div>
				</main>

				<section className="panel-card-large">
					<div className="flex flex-col gap-4">
						<div>
							<div className="label-row">Study tools</div>
							<p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
								Capture source material, then turn it into revision assets without leaving the session.
							</p>
						</div>
						<div className="segmented-tabs">
							<TabButton
								label="Materials"
								active={activePanel === "materials"}
								onClick={() => setActivePanel("materials")}
							/>
							<TabButton
								label="Flashcards"
								active={activePanel === "flashcards"}
								onClick={() => setActivePanel("flashcards")}
							/>
							<TabButton label="Quiz" active={activePanel === "quiz"} onClick={() => setActivePanel("quiz")} />
						</div>
					</div>

					{activePanel === "materials" ? (
						<div className="space-y-5">
							<div className="tool-panel">
								<div className="tool-panel-header">
									<div>
										<div className="label-row">Add study material</div>
										<p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
											Paste lecture notes, study guides, or textbook excerpts. Text-based file upload is supported for quick demos.
										</p>
									</div>
									<div className="tool-icon">
										<FileText className="size-4" />
									</div>
								</div>

								<input
									value={materialTitle}
									onChange={(event) => setMaterialTitle(event.target.value)}
									placeholder="Optional title, for example Lecture 4 notes"
									className="text-input"
								/>
								<textarea
									value={materialDraft}
									onChange={(event) => setMaterialDraft(event.target.value)}
									placeholder="Paste lecture notes, textbook excerpts, or study guide text..."
									className="input-area min-h-[180px]"
								/>
								<div className="flex flex-col gap-3">
									<input
										ref={fileInputRef}
										type="file"
										accept={FILE_ACCEPT_VALUE}
										onChange={(event) => void handleFileInput(event)}
										className="sr-only"
										id="material-file-input"
									/>
									<div className="upload-row">
										<label htmlFor="material-file-input" className="upload-button">
											Choose Notes File
										</label>
										<div className="upload-meta">
											<div className="upload-file-name">
												{selectedFileName || "No file selected"}
											</div>
											<div className="upload-file-help">
												Supports {SUPPORTED_UPLOAD_EXTENSIONS.join(", ")}
											</div>
										</div>
									</div>
									<button
										type="button"
										className="primary-button"
										onClick={() => void addMaterial()}
										disabled={isUploadingMaterial || !materialDraft.trim()}
									>
										{isUploadingMaterial ? "Saving notes..." : "Save Material"}
									</button>
								</div>
							</div>

							<StudyContextCard session={session} />

							<div className="space-y-3">
								<div className="label-row">Uploaded materials</div>
								<div className="space-y-3">
									{session?.materials.length ? (
										session.materials
											.slice()
											.reverse()
											.map((material) => <MaterialCard key={material.id} material={material} />)
									) : (
										<div className="content-card text-sm text-[var(--text-muted)]">
											No study material yet. Paste notes or upload a supported text-based file.
										</div>
									)}
								</div>
							</div>
						</div>
					) : null}

					{activePanel === "flashcards" ? (
						<div className="space-y-5">
							<div className="tool-panel">
								<div className="tool-panel-header">
									<div>
										<div className="label-row">Flashcard set</div>
										<p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
											Generate concise cards from your notes and recent tutoring context.
										</p>
									</div>
									<button
										type="button"
										className="primary-button"
										onClick={() => void buildFlashcards()}
										disabled={isGeneratingFlashcards}
									>
										{isGeneratingFlashcards ? "Generating..." : "Generate Flashcards"}
									</button>
								</div>
							</div>

							<div className="space-y-3">
								{session?.flashcards.length ? (
									<div className="space-y-4">
										<div className="practice-header">
											<div>
												<p className="text-sm text-[var(--text-muted)]">
													Test yourself first, then reveal the answer when you are ready.
												</p>
												<p className="practice-progress">
													Card {currentFlashcardIndex + 1} of {flashcardCount}
												</p>
											</div>
											<div className="practice-nav">
												<button
													type="button"
													className="secondary-button"
													onClick={() =>
														setCurrentFlashcardIndex((index) => Math.max(0, index - 1))
													}
													disabled={currentFlashcardIndex === 0}
												>
													<ChevronLeft className="size-4" /> Previous
												</button>
												<button
													type="button"
													className="secondary-button"
													onClick={() =>
														setCurrentFlashcardIndex((index) =>
															Math.min(flashcardCount - 1, index + 1),
														)
													}
													disabled={currentFlashcardIndex >= flashcardCount - 1}
												>
													Next <ChevronRight className="size-4" />
												</button>
											</div>
										</div>

										<div className="flashcard-stage">
											{activeFlashcard ? (
												<FlashcardTile
													key={`${activeFlashcard.front}-${currentFlashcardIndex}`}
													card={activeFlashcard}
													index={currentFlashcardIndex}
													revealed={Boolean(revealedFlashcards[currentFlashcardIndex])}
													onToggle={() =>
														setRevealedFlashcards((previous) => ({
															...previous,
															[currentFlashcardIndex]: !previous[currentFlashcardIndex],
														}))
													}
												/>
											) : null}
										</div>
									</div>
								) : (
									<div className="content-card text-sm text-[var(--text-muted)]">
										No flashcards yet. Generate a set after uploading notes or asking the tutor a few questions.
									</div>
								)}
							</div>
						</div>
					) : null}

					{activePanel === "quiz" ? (
						<div className="space-y-5">
							<div className="tool-panel">
								<div className="tool-panel-header">
									<div>
										<div className="label-row">Quiz builder</div>
										<p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
											Create multiple-choice practice with answers and short teaching explanations.
										</p>
									</div>
									<button
										type="button"
										className="primary-button"
										onClick={() => void buildQuiz()}
										disabled={isGeneratingQuiz}
									>
										{isGeneratingQuiz ? "Generating..." : "Generate Quiz"}
									</button>
								</div>
							</div>

							<div className="space-y-4">
								{session?.quizzes.length ? (
									<div className="space-y-5">
										<div className="practice-header">
											<div>
												<p className="text-sm text-[var(--text-muted)]">
													Pick an answer first, then check whether you were right.
												</p>
												<p className="practice-progress">
													Question {currentQuizIndex + 1} of {quizCount}
												</p>
											</div>
											<div className="practice-nav">
												<button
													type="button"
													className="secondary-button"
													onClick={() => setCurrentQuizIndex((index) => Math.max(0, index - 1))}
													disabled={currentQuizIndex === 0}
												>
													<ChevronLeft className="size-4" /> Previous
												</button>
												<button
													type="button"
													className="secondary-button"
													onClick={() =>
														setCurrentQuizIndex((index) => Math.min(quizCount - 1, index + 1))
													}
													disabled={currentQuizIndex >= quizCount - 1}
												>
													Next <ChevronRight className="size-4" />
												</button>
											</div>
										</div>
										<div className="quiz-stage">
											{activeQuiz ? (
											<QuizCard
												key={`${activeQuiz.question}-${currentQuizIndex}`}
												item={activeQuiz}
												index={currentQuizIndex}
												selectedOption={quizSelections[currentQuizIndex] ?? null}
												revealed={Boolean(revealedQuizItems[currentQuizIndex])}
												onSelect={(option) =>
													setQuizSelections((previous) => ({
														...previous,
														[currentQuizIndex]: option,
													}))
												}
												onReveal={() =>
													setRevealedQuizItems((previous) => ({
														...previous,
														[currentQuizIndex]: true,
													}))
												}
												onReset={() =>
													startTransition(() => {
														setRevealedQuizItems((previous) => ({
															...previous,
															[currentQuizIndex]: false,
														}));
														setQuizSelections((previous) => ({
															...previous,
															[currentQuizIndex]: "",
														}));
													})
												}
											/>
											) : null}
										</div>
									</div>
								) : (
									<div className="content-card text-sm text-[var(--text-muted)]">
										No quiz yet. Generate a practice set after adding material.
									</div>
								)}
							</div>
						</div>
					) : null}
				</section>
			</div>
		</div>
	);
}

function StudyContextCard({ session }: { session: StudySession | null }) {
	const workflowStatus = session?.workflowStatus.status ?? "idle";
	const isRunning = workflowStatus === "running";
	const isErrored = workflowStatus === "errored";

	return (
		<div className={`workflow-card ${isRunning ? "workflow-card-running" : ""} ${isErrored ? "workflow-card-error" : ""}`}>
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="label-row">Study context</div>
					<p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
						{isRunning
							? "The workflow is summarizing notes and extracting concepts."
							: isErrored
								? session?.workflowStatus.error || "The last ingestion run failed."
								: "Upload notes to build a summary and targeted review guidance."}
					</p>
				</div>
				<span className="status-pill">
					{isRunning ? "Running" : isErrored ? "Needs review" : "Ready"}
				</span>
			</div>

			<div className="study-context-grid">
				<div>
					<div className="card-label">Session summary</div>
					<p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
						{session?.summary || "Add material to generate a concise study summary."}
					</p>
				</div>
				<div>
					<div className="card-label">Weak areas to review</div>
					<div className="mt-3 flex flex-wrap gap-2">
						{session?.weakAreas.length ? (
							session.weakAreas.map((item) => (
								<span key={item} className="chip-pill chip-pill-accent">
									{item}
								</span>
							))
						) : (
							<p className="text-sm text-[var(--text-muted)]">
								Weak areas will appear here after ingestion.
							</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

function ChatEmptyState({ hasMaterials }: { hasMaterials: boolean }) {
	return (
		<div className="chat-empty-state">
			<div className="chat-empty-card">
				<div className="message-meta">
					<span className="inline-flex items-center gap-2">
						<GraduationCap className="size-4" />
						<span>Coach</span>
					</span>
				</div>
				<p className="mt-4 text-base leading-7 text-[var(--text-primary)]">
					{hasMaterials
						? "Your notes are ready. Ask for an explanation, a simpler version, or help turning them into a study plan."
						: "Start by pasting notes or ask about a topic you want to understand. I’ll keep the explanation concise and study-focused."}
				</p>
				<div className="starter-grid">
					<div className="starter-chip">Explain this in simpler language</div>
					<div className="starter-chip">What should I memorize first?</div>
					<div className="starter-chip">Make me a quick review plan</div>
				</div>
			</div>
		</div>
	);
}

function MessageBubble({
	role,
	content,
	pending = false,
}: {
	role: "user" | "assistant";
	content: string;
	pending?: boolean;
}) {
	return (
		<div className={`message-row ${role === "user" ? "justify-end" : "justify-start"}`}>
			<div className={`message-card ${role === "user" ? "message-user" : "message-assistant"}`}>
				<div className="message-meta">
					<span className="inline-flex items-center gap-2">
						{role === "assistant" ? (
							<GraduationCap className="size-4" />
						) : (
							<Sparkles className="size-4" />
						)}
						<span>{role === "assistant" ? "Coach" : "You"}</span>
					</span>
					{pending ? <span className="stream-badge">Streaming</span> : null}
				</div>
				<div className="mt-3 text-sm leading-6">
					<MarkdownContent source={content} />
				</div>
			</div>
		</div>
	);
}

function MaterialCard({ material }: { material: StudyMaterial }) {
	return (
		<div className="content-card">
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="card-label">{material.title}</div>
					<p className="mt-2 text-xs text-[var(--text-muted)]">
						Added {formatTimestamp(material.createdAt)}
					</p>
				</div>
				<div className="tool-icon">
					<FileText className="size-4" />
				</div>
			</div>
			<p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
				{material.summary || material.content.slice(0, 180)}
			</p>
			<div className="mt-4 flex flex-wrap gap-2">
				{material.concepts.length ? (
					material.concepts.map((concept) => (
						<span key={concept} className="chip-pill">
							{concept}
						</span>
					))
				) : (
					<span className="text-xs text-[var(--text-muted)]">Concept extraction pending.</span>
				)}
			</div>
		</div>
	);
}

function FlashcardTile({
	card,
	index,
	revealed,
	onToggle,
}: {
	card: { front: string; back: string };
	index: number;
	revealed: boolean;
	onToggle: () => void;
}) {
	return (
		<button type="button" className={`flashcard-tile ${revealed ? "flashcard-tile-revealed" : ""}`} onClick={onToggle}>
			<div className="flashcard-tile-header">
				<div className="card-label">Card {index + 1}</div>
				<span className="flashcard-toggle">
					{revealed ? (
						<>
							<ChevronUp className="size-4" /> Hide answer
						</>
					) : (
						<>
							<ChevronDown className="size-4" /> Reveal answer
						</>
					)}
				</span>
			</div>
			<p className="mt-4 text-base leading-7 text-[var(--text-primary)]">{card.front}</p>
			<div className={`flashcard-answer-panel ${revealed ? "flashcard-answer-panel-visible" : ""}`}>
				<div className="card-label">Answer</div>
				<p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">{card.back}</p>
			</div>
		</button>
	);
}

function QuizCard({
	item,
	index,
	selectedOption,
	revealed,
	onSelect,
	onReveal,
	onReset,
}: {
	item: { question: string; options: string[]; answer: string; explanation: string };
	index: number;
	selectedOption: string | null;
	revealed: boolean;
	onSelect: (option: string) => void;
	onReveal: () => void;
	onReset: () => void;
}) {
	const isCorrect = selectedOption === item.answer;

	return (
		<div className="quiz-card">
			<div className="card-label">Question {index + 1}</div>
			<h3 className="mt-3 text-base font-semibold leading-7 text-[var(--text-primary)]">{item.question}</h3>
			<div className="mt-4 space-y-2">
				{item.options.map((option) => {
					const isSelected = selectedOption === option;
					const isCorrectOption = revealed && option === item.answer;
					const isIncorrectSelection = revealed && isSelected && option !== item.answer;

					return (
						<button
							key={option}
							type="button"
							className={`quiz-option-button ${
								isSelected ? "quiz-option-selected" : ""
							} ${isCorrectOption ? "quiz-option-correct" : ""} ${
								isIncorrectSelection ? "quiz-option-wrong" : ""
							}`}
							onClick={() => onSelect(option)}
							disabled={revealed}
						>
							<span>{option}</span>
							{revealed && option === item.answer ? <CheckCircle2 className="size-4" /> : null}
						</button>
					);
				})}
			</div>

			<div className="quiz-actions">
				<button
					type="button"
					className="secondary-button"
					onClick={revealed ? onReset : onReveal}
					disabled={!revealed && !selectedOption}
				>
					{revealed ? "Try again" : "Check answer"}
				</button>
				{selectedOption ? (
					<span className="quiz-selection-note">
						Selected: {selectedOption}
					</span>
				) : (
					<span className="quiz-selection-note">
						Choose one option before checking.
					</span>
				)}
			</div>

			{revealed ? (
				<div className={`quiz-feedback ${isCorrect ? "quiz-feedback-correct" : "quiz-feedback-review"}`}>
					<div className="inline-flex items-center gap-2 font-semibold">
						{isCorrect ? <CheckCircle2 className="size-4" /> : <HelpCircle className="size-4" />}
						{isCorrect ? "Correct" : `Correct answer: ${item.answer}`}
					</div>
					<p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{item.explanation}</p>
				</div>
			) : null}
		</div>
	);
}

function TabButton({
	label,
	active,
	onClick,
}: {
	label: string;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`tab-button ${active ? "tab-button-active" : ""}`}
		>
			{label}
		</button>
	);
}

function BadgeRow({ icon, label }: { icon: ReactNode; label: string }) {
	return (
		<div className="flex items-center gap-3">
			<span className="tool-icon">{icon}</span>
			<span>{label}</span>
		</div>
	);
}

function apiUrl(path: string): string {
	if (!API_BASE_URL) {
		return path;
	}

	return `${API_BASE_URL.replace(/\/$/, "")}${path}`;
}

function getInitialTheme(): ThemeMode {
	if (typeof window === "undefined") {
		return "light";
	}

	const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
	if (saved === "light" || saved === "dark") {
		return saved;
	}

	if (typeof window.matchMedia !== "function") {
		return "light";
	}

	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function loadRecentSessions(): RecentSession[] {
	if (typeof window === "undefined") {
		return [];
	}

	try {
		const raw = window.localStorage.getItem(RECENT_SESSIONS_KEY);
		if (!raw) {
			return [];
		}

		const parsed = JSON.parse(raw) as RecentSession[];
		return Array.isArray(parsed)
			? parsed.filter((item) => item.id && item.title && item.updatedAt)
			: [];
	} catch {
		return [];
	}
}

function saveRecentSessions(items: RecentSession[]) {
	window.localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(items.slice(0, 8)));
}

function upsertRecentSession(
	existing: RecentSession[],
	session: StudySession,
): RecentSession[] {
	const nextItem: RecentSession = {
		id: session.id,
		title: session.title,
		updatedAt: session.updatedAt,
	};

	return [nextItem, ...existing.filter((item) => item.id !== session.id)].slice(0, 8);
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

async function safeJson(response: Response) {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

function formatTimestamp(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "recently";
	}

	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(date);
}

function isSupportedUploadFile(file: File): boolean {
	const normalizedName = file.name.toLowerCase();
	return SUPPORTED_UPLOAD_EXTENSIONS.some((extension) => normalizedName.endsWith(extension));
}
