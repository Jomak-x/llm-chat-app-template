import {
	startTransition,
	useEffect,
	useRef,
	useState,
	type ReactNode,
	type RefObject,
} from "react";
import {
	ArrowRight,
	BrainCircuit,
	CheckCircle2,
	ChevronRight,
	Copy,
	Download,
	FileStack,
	Globe2,
	Mic,
	Radar,
	Search,
	Sparkles,
	Wand2,
	X,
} from "lucide-react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { MarkdownContent } from "./components/MarkdownContent";
import { ForecastChart } from "./components/ForecastChart";
import type {
	ApiErrorResponse,
	ChatMessage,
	CompetitorProfile,
	ProjectState,
	SpeechRecognitionLike,
} from "./lib/types";

const SESSION_STORAGE_KEY = "idea-to-launch-session-id";
const POLL_INTERVAL_MS = 2200;
const FALLBACK_REFRESH_DELAY_MS = 600;

const STARTER_DEMOS = [
	{
		title: "Support copilot",
		prompt:
			"Build an AI support copilot for API companies that turns docs and ticket history into faster, higher-quality draft replies for lean support teams.",
		urls: ["https://www.intercom.com", "https://www.zendesk.com"],
	},
	{
		title: "Docs agent",
		prompt:
			"Create a docs agent for developer platforms that answers implementation questions and recommends the next API step from long documentation.",
		urls: ["https://www.algolia.com", "https://www.readme.com"],
	},
	{
		title: "Hotel concierge agent",
		prompt:
			"Build an AI concierge for boutique hotels that helps front desk teams answer guest questions faster and upsell relevant services.",
		urls: ["https://www.canarytechnologies.com", "https://www.mews.com"],
	},
];

const SAMPLE_COMPETITOR_URLS = [
	"https://www.intercom.com",
	"https://www.zendesk.com",
	"https://www.readme.com",
];

const QUICK_START_IDEAS = [
	{
		label: "Support copilot",
		prompt:
			"Build an AI support copilot for API companies that drafts better replies from docs and ticket history.",
	},
	{
		label: "Docs agent",
		prompt:
			"Create a docs agent that answers implementation questions and recommends the next API step from long documentation.",
	},
	{
		label: "Hotel concierge",
		prompt:
			"Build an AI concierge for boutique hotels that helps front desk teams answer guest questions faster and upsell relevant services.",
	},
];

const BRAINSTORM_ASSISTS = [
	{
		label: "Sharpen audience",
		append: "Help me sharpen the target user and make the audience narrower.",
	},
	{
		label: "Find the wedge",
		append: "Help me find the sharpest wedge against existing alternatives.",
	},
	{
		label: "Cloudflare fit",
		append: "Recommend the best Cloudflare architecture for this idea and explain why.",
	},
	{
		label: "Outreach plan",
		append: "Turn this into a design-partner outreach and validation plan.",
	},
];

const SPEECH_RECOGNITION =
	typeof window !== "undefined"
		? window.SpeechRecognition || window.webkitSpeechRecognition || null
		: null;

type AppState = ProjectState | null;

export default function App() {
	const navigate = useNavigate();
	const location = useLocation();
	const chatScrollRef = useRef<HTMLDivElement | null>(null);
	const userInputRef = useRef<HTMLTextAreaElement | null>(null);
	const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
	const pollHandleRef = useRef<number | null>(null);
	const queuedStarterRef = useRef<(typeof STARTER_DEMOS)[number] | null>(null);
	const messageRenderFrameRef = useRef<number | null>(null);
	const pendingAssistantMessageRef = useRef("");

	const [sessionId, setSessionId] = useState(() => getOrCreateSessionId());
	const activeSessionIdRef = useRef(sessionId);
	const [currentState, setCurrentState] = useState<AppState>(null);
	const [pendingAssistantMessage, setPendingAssistantMessage] = useState<string | null>(null);
	const [draft, setDraft] = useState("");
	const [competitorInput, setCompetitorInput] = useState("");
	const [competitorStatus, setCompetitorStatus] = useState<string | null>(null);
	const [isSending, setIsSending] = useState(false);
	const [isListening, setIsListening] = useState(false);
	const [voiceStatus, setVoiceStatus] = useState("Voice input ready.");

	useEffect(() => {
		activeSessionIdRef.current = sessionId;
	}, [sessionId]);

	useEffect(() => {
		void loadState();

		return () => {
			if (pollHandleRef.current !== null) {
				window.clearInterval(pollHandleRef.current);
			}
			if (messageRenderFrameRef.current !== null) {
				window.cancelAnimationFrame(messageRenderFrameRef.current);
			}
		};
	}, [sessionId]);

	useEffect(() => {
		if (!SPEECH_RECOGNITION) {
			setVoiceStatus("Voice input is available in supported Chromium-based browsers.");
			return;
		}

		const recognition = new SPEECH_RECOGNITION();
		recognition.lang = "en-US";
		recognition.continuous = false;
		recognition.interimResults = false;
		recognition.maxAlternatives = 1;
		recognition.onstart = () => {
			setIsListening(true);
			setVoiceStatus("Listening... pause when your idea is complete.");
		};
		recognition.onresult = (event) => {
			const transcript = event.results?.[0]?.[0]?.transcript ?? "";
			if (!transcript.trim()) {
				return;
			}

			startTransition(() => {
				setDraft(transcript.replace(/\s+/g, " ").trim());
				setVoiceStatus("Voice captured. Edit if you want, then send.");
			});
			navigate("/workspace");
		};
		recognition.onerror = (event) => {
			setVoiceStatus(
				event.error === "not-allowed"
					? "Microphone permission was denied."
					: "Voice input hit an issue. Please try again or type instead.",
			);
		};
		recognition.onend = () => {
			setIsListening(false);
		};

		recognitionRef.current = recognition;

		return () => {
			recognition.stop();
			recognitionRef.current = null;
		};
	}, [navigate]);

	useEffect(() => {
		const isWorkspace = location.pathname === "/workspace";
		if (!isWorkspace || !queuedStarterRef.current || isSending || !currentState) {
			return;
		}

		const starter = queuedStarterRef.current;
		queuedStarterRef.current = null;
		void seedDemo(starter);
	}, [currentState, isSending, location.pathname]);

	useEffect(() => {
		const workflowRunning = currentState?.workflowStatus.status === "running";

		if (workflowRunning && pollHandleRef.current === null) {
			pollHandleRef.current = window.setInterval(() => {
				void loadState();
			}, POLL_INTERVAL_MS);
			return;
		}

		if (!workflowRunning && pollHandleRef.current !== null) {
			window.clearInterval(pollHandleRef.current);
			pollHandleRef.current = null;
		}
	}, [currentState?.workflowStatus.status]);

	useEffect(() => {
		const container = chatScrollRef.current;
		if (!container) {
			return;
		}

		if (pendingAssistantMessage !== null || isNearBottom(container, 140)) {
			container.scrollTop = container.scrollHeight;
		}
	}, [currentState?.messages, pendingAssistantMessage]);

	async function fetchState(targetSessionId = sessionId): Promise<ProjectState> {
		const response = await fetch(`/api/state?sessionId=${encodeURIComponent(targetSessionId)}`);
		if (!response.ok) {
			throw new Error("Failed to load state");
		}

		return response.json() as Promise<ProjectState>;
	}

	async function loadState(targetSessionId = sessionId) {
		try {
			const nextState = await fetchState(targetSessionId);
			if (activeSessionIdRef.current !== targetSessionId) {
				return null;
			}

			startTransition(() => {
				setCurrentState(nextState);
			});
			return nextState;
		} catch (error) {
			console.error(error);
			return null;
		}
	}

	async function seedDemo(starter: (typeof STARTER_DEMOS)[number]) {
		await saveCompetitors(starter.urls);
		await sendMessage(starter.prompt);
	}

	async function saveCompetitors(urls: string[]) {
		const requestSessionId = sessionId;
		try {
			setCompetitorStatus(null);
			const response = await fetch("/api/competitors", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ sessionId: requestSessionId, urls }),
			});

			if (!response.ok) {
				const payload = (await safeJson(response)) as ApiErrorResponse | null;
				throw new Error(payload?.error || "Failed to save competitor URLs");
			}

			const nextState = (await response.json()) as ProjectState;
			if (activeSessionIdRef.current === requestSessionId) {
				startTransition(() => {
					setCurrentState(nextState);
				});
			}
			setCompetitorStatus(
				nextState.competitorUrls.length > 0
					? `${nextState.competitorUrls.length} competitor URL${nextState.competitorUrls.length === 1 ? "" : "s"} saved.`
					: "Competitor list cleared.",
			);
		} catch (error) {
			console.error(error);
			setCompetitorStatus(
				error instanceof Error
					? error.message
					: "Could not save competitor URLs right now.",
			);
		}
	}

	async function addCompetitors() {
		const urls = competitorInput
			.split(/[\n,]+/)
			.map((value) => value.trim())
			.filter(Boolean);
		if (urls.length === 0) {
			return;
		}

		const combined = [...(currentState?.competitorUrls ?? []), ...urls];
		setCompetitorInput("");
		await saveCompetitors(combined);
	}

	async function useSampleCompetitor(url: string) {
		await saveCompetitors([...(currentState?.competitorUrls ?? []), url]);
	}

	async function removeCompetitor(url: string) {
		await saveCompetitors((currentState?.competitorUrls ?? []).filter((item) => item !== url));
	}

	async function clearCompetitors() {
		await saveCompetitors([]);
	}

	async function sendMessage(explicitMessage?: string) {
		const nextMessage = (explicitMessage ?? draft).trim();
		if (!nextMessage || isSending) {
			return;
		}

		const requestSessionId = sessionId;
		navigate("/workspace");

		if (isListening) {
			recognitionRef.current?.stop();
		}

		setIsSending(true);
		pendingAssistantMessageRef.current = "";
		setPendingAssistantMessage("");
		setDraft("");
		let receivedFinalState = false;

		startTransition(() => {
			setCurrentState((previousState) => {
				const messages = [
					...(previousState?.messages ?? []),
					{ role: "user", content: nextMessage } satisfies ChatMessage,
				];
				return {
					...(previousState ?? createClientFallbackState()),
					messages,
				};
			});
		});

		try {
			const response = await fetch("/api/chat", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ sessionId: requestSessionId, message: nextMessage }),
			});

			if (!response.ok || !response.body) {
				throw new Error("Failed to start chat response");
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			let sawDone = false;

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					const parsed = consumeSseEvents(`${buffer}\n\n`);
					const result = applySseEvents(parsed.events, requestSessionId);
					receivedFinalState = receivedFinalState || result.receivedState;
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const parsed = consumeSseEvents(buffer);
				buffer = parsed.buffer;
				const result = applySseEvents(parsed.events, requestSessionId);
				sawDone = sawDone || result.sawDone;
				receivedFinalState = receivedFinalState || result.receivedState;
				if (sawDone) {
					break;
				}
			}
		} catch (error) {
			console.error(error);
			pendingAssistantMessageRef.current =
				"I hit a temporary issue while replying. Your session is still saved, so try the next turn again.";
			if (activeSessionIdRef.current === requestSessionId) {
				setPendingAssistantMessage(pendingAssistantMessageRef.current);
			}
		} finally {
			const finalAssistantMessage = pendingAssistantMessageRef.current.trim();
			setIsSending(false);

			if (
				activeSessionIdRef.current === requestSessionId &&
				!receivedFinalState &&
				finalAssistantMessage
			) {
				startTransition(() => {
					setCurrentState((previousState) =>
						appendLocalAssistant(previousState, finalAssistantMessage),
					);
				});
				window.setTimeout(() => {
					if (activeSessionIdRef.current === requestSessionId) {
						void loadState(requestSessionId);
					}
				}, FALLBACK_REFRESH_DELAY_MS);
			}

			pendingAssistantMessageRef.current = "";
			if (activeSessionIdRef.current === requestSessionId) {
				setPendingAssistantMessage(null);
			}
			window.setTimeout(() => {
				userInputRef.current?.focus();
			}, 20);
		}
	}

	function applySseEvents(events: string[], requestSessionId: string) {
		let sawDone = false;
		let receivedState = false;

		for (const data of events) {
			if (data === "[DONE]") {
				sawDone = true;
				break;
			}

			try {
				const parsed = JSON.parse(data) as {
					response?: string;
					state?: ProjectState;
				};

				if (
					typeof parsed.response === "string" &&
					activeSessionIdRef.current === requestSessionId
				) {
					queuePendingAssistantChunk(parsed.response);
				}

				if (parsed.state) {
					const nextState = parsed.state;
					receivedState = true;
					pendingAssistantMessageRef.current = "";
					if (activeSessionIdRef.current === requestSessionId) {
						startTransition(() => {
							setCurrentState(nextState);
							setPendingAssistantMessage(null);
						});
					}
				}
			} catch (error) {
				console.error("Failed to parse SSE event", error, data);
			}
		}

		return { sawDone, receivedState };
	}

	function queuePendingAssistantChunk(chunk: string) {
		pendingAssistantMessageRef.current += chunk;
		if (messageRenderFrameRef.current !== null) {
			return;
		}

		messageRenderFrameRef.current = window.requestAnimationFrame(() => {
			startTransition(() => {
				setPendingAssistantMessage(pendingAssistantMessageRef.current);
			});
			messageRenderFrameRef.current = null;
		});
	}

	async function runAnalysis() {
		const requestSessionId = sessionId;
		try {
			startTransition(() => {
				setCurrentState((previousState) =>
					previousState
						? {
								...previousState,
								workflowStatus: {
									...previousState.workflowStatus,
									status: "running",
									error: null,
								},
							}
						: previousState,
				);
			});

			const response = await fetch("/api/run-analysis", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ sessionId: requestSessionId }),
			});

			if (!response.ok) {
				const payload = (await safeJson(response)) as ApiErrorResponse | null;
				throw new Error(payload?.error || "Failed to start market analysis");
			}

			await loadState(requestSessionId);
		} catch (error) {
			console.error(error);
			startTransition(() => {
				setCurrentState((previousState) =>
					previousState
						? {
								...previousState,
								workflowStatus: {
									...previousState.workflowStatus,
									status: "errored",
									error:
										error instanceof Error
											? error.message
											: "Could not start market analysis.",
								},
							}
						: previousState,
				);
			});
		}
	}

	async function resetSession() {
		const previousSessionId = sessionId;
		const nextSessionId = createAndStoreSessionId();

		if (pollHandleRef.current !== null) {
			window.clearInterval(pollHandleRef.current);
			pollHandleRef.current = null;
		}

		if (messageRenderFrameRef.current !== null) {
			window.cancelAnimationFrame(messageRenderFrameRef.current);
			messageRenderFrameRef.current = null;
		}

		activeSessionIdRef.current = nextSessionId;
		recognitionRef.current?.stop();
		queuedStarterRef.current = null;
		pendingAssistantMessageRef.current = "";
		setDraft("");
		setCompetitorInput("");
		setCompetitorStatus(null);
		setPendingAssistantMessage(null);
		setIsSending(false);
		startTransition(() => {
			setCurrentState(null);
		});
		setVoiceStatus(
			SPEECH_RECOGNITION
				? "Voice input ready."
				: "Voice input is available in supported Chromium-based browsers.",
		);
		setSessionId(nextSessionId);
		navigate("/");

		try {
			const response = await fetch("/api/reset", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ sessionId: previousSessionId }),
			});

			if (!response.ok) {
				throw new Error("Failed to reset state");
			}
		} catch (error) {
			console.error(error);
		}
	}

	function queueStarterDemo(starter: (typeof STARTER_DEMOS)[number]) {
		queuedStarterRef.current = starter;
		navigate("/workspace");
	}

	function openWorkspace() {
		navigate("/workspace");
	}

	function toggleVoiceInput() {
		if (!recognitionRef.current || isSending) {
			return;
		}

		if (isListening) {
			recognitionRef.current.stop();
			return;
		}

		navigate("/workspace");
		setVoiceStatus("");
		recognitionRef.current.start();
	}

	const hasSessionContent = Boolean(
		currentState?.messages.some((message) => message.role === "user") ||
			currentState?.websitePrototype?.html ||
			currentState?.competitorUrls?.length,
	);
	const hasUserMessage = Boolean(
		currentState?.messages.some((message) => message.role === "user"),
	);

	return (
		<div className="mx-auto max-w-[1500px] p-4 sm:p-6">
			<Routes>
				<Route
					path="/"
					element={
						<LandingPage
							hasSessionContent={hasSessionContent}
							onContinue={openWorkspace}
							onOpenWorkspace={openWorkspace}
							onDemoClick={queueStarterDemo}
						/>
					}
				/>
				<Route
					path="/workspace"
					element={
						<WorkspacePage
							competitorInput={competitorInput}
							competitorStatus={competitorStatus}
							currentState={currentState}
							draft={draft}
							hasUserMessage={hasUserMessage}
							isListening={isListening}
							isSending={isSending}
							onAddCompetitors={() => void addCompetitors()}
							onBack={() => navigate("/")}
							onClearCompetitors={() => void clearCompetitors()}
							onCompetitorInputChange={setCompetitorInput}
							onDraftChange={(value) => {
								setDraft(value);
							}}
							onGenerate={runAnalysis}
							onReset={resetSession}
							onRemoveCompetitor={(url) => void removeCompetitor(url)}
							onSend={() => void sendMessage()}
							onToggleVoice={toggleVoiceInput}
							onUseQuickIdea={(prompt) => {
								setDraft(prompt);
								window.setTimeout(() => {
									userInputRef.current?.focus();
								}, 20);
							}}
							onUseSampleCompetitor={(url) => void useSampleCompetitor(url)}
							pendingAssistantMessage={pendingAssistantMessage}
							voiceStatus={voiceStatus}
							chatScrollRef={chatScrollRef}
							userInputRef={userInputRef}
						/>
					}
				/>
				<Route path="*" element={<Navigate to="/" replace />} />
			</Routes>
		</div>
	);
}

interface LandingPageProps {
	hasSessionContent: boolean;
	onContinue: () => void;
	onOpenWorkspace: () => void;
	onDemoClick: (demo: (typeof STARTER_DEMOS)[number]) => void;
}

function LandingPage({
	hasSessionContent,
	onContinue,
	onOpenWorkspace,
	onDemoClick,
}: LandingPageProps) {
	return (
		<div className="space-y-4">
			<header className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_360px]">
				<div className="glass-card relative overflow-hidden p-6 sm:p-8">
					<div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_top,rgba(255,145,77,0.16),transparent_62%)] lg:block" />
					<div className="relative space-y-4">
						<div className="section-chip">LaunchLens AI App Auditor</div>
						<h1 className="max-w-4xl font-serif text-[clamp(2.3rem,5vw,4.5rem)] leading-[0.95] text-slate-900">
							Go from AI app idea to Cloudflare build plan.
						</h1>
						<p className="max-w-3xl text-base leading-7 text-slate-600 sm:text-lg">
							Paste one idea or URL. LaunchLens returns the market read, the Cloudflare
							architecture, the builder handoff, and an interactive launch page.
						</p>
						<div className="flex flex-wrap gap-2">
							<AudiencePill label="For Cloudflare engineers" tone="emerald" />
							<AudiencePill label="For builders" tone="orange" />
							<AudiencePill label="For fast demos" tone="slate" />
						</div>
						<div className="grid gap-3 sm:grid-cols-3">
							<StoryCard
								icon={<BrainCircuit className="size-5 text-orange-600" />}
								title="Brief"
								copy="Start with one sentence or a URL."
							/>
							<StoryCard
								icon={<Search className="size-5 text-emerald-600" />}
								title="Audit"
								copy="Get the wedge, competitors, and proof."
							/>
							<StoryCard
								icon={<Wand2 className="size-5 text-sky-600" />}
								title="Ship"
								copy="Export the build kit and launch page."
							/>
						</div>
						<div className="flex flex-col gap-3 pt-2 sm:flex-row">
							<button className="primary-button" type="button" onClick={onOpenWorkspace}>
								Open Workspace
							</button>
							{hasSessionContent ? (
								<button className="secondary-button" type="button" onClick={onContinue}>
									Continue Session
								</button>
							) : null}
						</div>
					</div>
				</div>

				<aside className="glass-card flex flex-col gap-4 p-6">
					<div className="rounded-[28px] border border-orange-200 bg-[linear-gradient(180deg,rgba(255,244,238,0.95),rgba(255,250,247,0.96))] p-5">
						<div className="section-chip">In one minute</div>
						<div className="mt-4 space-y-3">
							<AssignmentCoverageRow
								title="1. Paste the idea"
								copy="No setup. One sentence or a URL is enough."
							/>
							<AssignmentCoverageRow
								title="2. Review the audit"
								copy="LaunchLens scouts sources, picks the wedge, and explains the market."
							/>
							<AssignmentCoverageRow
								title="3. Hand it off"
								copy="Copy the markdown build kit or open the HTML launch page."
							/>
						</div>
					</div>
					<div className="panel-card border-emerald-200 bg-emerald-50/80 p-5">
						<div className="section-chip bg-emerald-100 text-emerald-800">Why Cloudflare matters here</div>
						<p className="mt-4 text-sm leading-7 text-slate-700">
							This is not just idea generation. LaunchLens turns the audit into a concrete
							Cloudflare architecture recommendation and a handoff another engineer can use immediately.
						</p>
						<div className="mt-4 flex flex-wrap gap-2">
							{[
								"Workers AI",
								"Workflow",
								"Durable Object memory",
								"Chat + Voice",
							].map((item) => (
								<span
									key={item}
									className="rounded-full bg-white/80 px-3 py-2 text-xs font-semibold text-emerald-800"
								>
									{item}
								</span>
							))}
						</div>
					</div>
				</aside>
			</header>

			<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
				<section className="glass-card p-6 sm:p-8">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
						<div>
							<div className="section-chip">Try a starter scenario</div>
							<h2 className="mt-3 font-serif text-3xl text-slate-900">Start from a realistic AI app</h2>
							<p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
								Each scenario shows the whole flow: brief the idea, run the audit, then inspect the
								Cloudflare build handoff and generated launch page.
							</p>
						</div>
					</div>
					<div className="mt-5 grid gap-3">
						{STARTER_DEMOS.map((demo) => (
							<button
								key={demo.title}
								type="button"
								onClick={() => onDemoClick(demo)}
								className="w-full rounded-[24px] border border-orange-200 bg-[linear-gradient(180deg,rgba(255,248,243,0.96),rgba(255,255,255,0.92))] p-5 text-left transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-[0_18px_35px_-26px_rgba(249,115,22,0.55)]"
							>
								<div className="flex items-start justify-between gap-4">
									<div>
										<div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">
											{demo.title}
										</div>
										<p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">{demo.prompt}</p>
									</div>
									<ChevronRight className="mt-1 size-5 shrink-0 text-orange-700" />
								</div>
							</button>
						))}
					</div>
				</section>

				<aside className="space-y-4">
					<div className="glass-card p-5">
						<div className="section-chip">What you get</div>
						<div className="mt-4 space-y-3">
							<InfoCard
								title="Market wedge"
								copy="A tighter position based on public market signals."
							/>
							<InfoCard
								title="Cloudflare plan"
								copy="A practical recommendation for which Cloudflare services should power v1."
							/>
							<InfoCard
								title="Build-ready handoff"
								copy="A markdown build kit plus an interactive HTML launch page."
							/>
						</div>
					</div>
				</aside>
			</div>
		</div>
	);
}

interface WorkspacePageProps {
	competitorInput: string;
	competitorStatus: string | null;
	currentState: ProjectState | null;
	draft: string;
	hasUserMessage: boolean;
	isListening: boolean;
	isSending: boolean;
	onAddCompetitors: () => void;
	onBack: () => void;
	onClearCompetitors: () => void;
	onCompetitorInputChange: (value: string) => void;
	onDraftChange: (value: string) => void;
	onGenerate: () => void;
	onReset: () => void;
	onRemoveCompetitor: (url: string) => void;
	onSend: () => void;
	onToggleVoice: () => void;
	onUseQuickIdea: (prompt: string) => void;
	onUseSampleCompetitor: (url: string) => void;
	pendingAssistantMessage: string | null;
	voiceStatus: string;
	chatScrollRef: RefObject<HTMLDivElement | null>;
	userInputRef: RefObject<HTMLTextAreaElement | null>;
}

function WorkspacePage({
	competitorInput,
	competitorStatus,
	currentState,
	draft,
	hasUserMessage,
	isListening,
	isSending,
	onAddCompetitors,
	onBack,
	onClearCompetitors,
	onCompetitorInputChange,
	onDraftChange,
	onGenerate,
	onReset,
	onRemoveCompetitor,
	onSend,
	onToggleVoice,
	onUseQuickIdea,
	onUseSampleCompetitor,
	pendingAssistantMessage,
	voiceStatus,
	chatScrollRef,
	userInputRef,
}: WorkspacePageProps) {
	const workflowStatus = currentState?.workflowStatus?.status ?? "idle";
	const researchStatus = currentState?.researchStatus;
	const readiness = buildReadinessSummary(currentState, hasUserMessage);
	const [activeView, setActiveView] = useState<"overview" | "market" | "build" | "prototype">(
		"overview",
	);
	const [showCompetitorEditor, setShowCompetitorEditor] = useState(false);
	const canRunAnalysis =
		hasUserMessage && !isSending && workflowStatus !== "running";
	const canClearCompetitors = (currentState?.competitorUrls?.length ?? 0) > 0;

	useEffect(() => {
		if (currentState?.websitePrototype?.html) {
			setActiveView("prototype");
		} else if (currentState?.cloudflarePlan) {
			setActiveView("build");
		} else if (
			(currentState?.marketInsights.length ?? 0) > 0 ||
			(currentState?.competitorResearch.length ?? 0) > 0
		) {
			setActiveView("market");
		}
	}, [
		currentState?.cloudflarePlan,
		currentState?.competitorResearch.length,
		currentState?.marketInsights.length,
		currentState?.websitePrototype?.html,
	]);

	return (
		<div className="space-y-4">
			<header className="glass-card flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
				<div className="space-y-2">
					<div className="section-chip">LaunchLens</div>
					<h1 className="font-serif text-3xl text-slate-900">
						See whether this AI app is worth building.
					</h1>
					<p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
						LaunchLens turns one idea into a market read, Cloudflare architecture, and a handoff
						another engineer can build from.
					</p>
				</div>
				<div className="flex flex-col gap-3 sm:flex-row">
					<button className="secondary-button" type="button" onClick={onBack}>
						Back To Landing
					</button>
					<button
						className="primary-button"
						type="button"
						onClick={onGenerate}
						disabled={!canRunAnalysis}
					>
						{workflowStatus === "running" ? "Running Audit..." : "Run Audit & Plan"}
					</button>
					<button className="secondary-button" type="button" onClick={onReset}>
						New Session
					</button>
				</div>
			</header>

			<div className="grid gap-4 xl:grid-cols-[460px_minmax(0,1fr)]">
				<section className="glass-card grid min-h-[680px] min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-4 xl:sticky xl:top-4 xl:h-[80vh]">
					<div className="space-y-3 border-b border-slate-200 px-2 pb-4">
						<div>
							<div className="section-chip">Start here</div>
							<h2 className="mt-3 font-serif text-2xl text-slate-900">Brief the idea</h2>
							<p className="mt-2 text-sm leading-6 text-slate-600">
								Include the user, the workflow, and why it matters. You can also paste a product URL.
							</p>
							<div className="mt-3 flex flex-wrap gap-2">
								{QUICK_START_IDEAS.map((idea) => (
									<button
										key={idea.label}
										type="button"
										onClick={() => onUseQuickIdea(idea.prompt)}
										className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-orange-300 hover:bg-orange-50"
									>
										Try {idea.label}
									</button>
								))}
							</div>
						</div>
					</div>

					<div
						ref={chatScrollRef}
						className="min-h-0 space-y-4 overflow-y-auto px-2 py-4"
					>
						{!hasUserMessage && pendingAssistantMessage === null ? (
							<div className="panel-card p-4">
								<div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
									What LaunchLens returns
								</div>
								<p className="mt-2 text-sm leading-6 text-slate-600">
									Paste the idea, then let LaunchLens do the first product review for you.
								</p>
								<div className="mt-4 grid gap-3 sm:grid-cols-2">
									<CapabilityTile
										title="Market read"
										copy="Likely competitors and a tighter wedge."
										tone="emerald"
									/>
									<CapabilityTile
										title="Cloudflare fit"
										copy="A concrete service recommendation for v1."
										tone="sky"
									/>
									<CapabilityTile
										title="Builder handoff"
										copy="A markdown kit ready for a coding agent."
										tone="orange"
									/>
									<CapabilityTile
										title="Interactive launch page"
										copy="An HTML page you can open and review immediately."
										tone="slate"
									/>
								</div>
							</div>
						) : null}
						{currentState?.messages.map((message, index) => (
							<MessageBubble key={`${message.role}-${index}`} role={message.role} content={message.content} />
						))}
						{pendingAssistantMessage !== null ? (
							<MessageBubble
								role="assistant"
								content={
									pendingAssistantMessage || "Working through the strongest angle for this idea..."
								}
								isStreaming
							/>
						) : null}
					</div>

					<div className="border-t border-slate-200 px-2 pt-4">
						<div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(249,250,251,0.94))] p-4 shadow-[0_18px_36px_-32px_rgba(15,23,42,0.45)]">
							<div className="flex flex-wrap items-center justify-between gap-3 pb-3">
								<div>
									<div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
										Brainstorm
									</div>
									<p className="mt-1 text-xs leading-5 text-slate-500">
										Describe the user, the workflow, and the outcome. Press Enter to send.
									</p>
								</div>
								<div className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700">
									{isSending ? "Sending..." : "Ready"}
								</div>
							</div>
							<textarea
								ref={userInputRef}
								value={draft}
								onChange={(event) => onDraftChange(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter" && !event.shiftKey) {
										event.preventDefault();
										onSend();
									}
								}}
								rows={4}
								placeholder="AI support copilot for API companies that drafts replies from docs and tickets."
								className="min-h-[132px] w-full resize-none overflow-y-auto rounded-[24px] border border-slate-200 bg-white px-4 py-3 text-base leading-6 text-slate-900 outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
							/>
							<div className="mt-4 grid gap-4">
								<div className="grid gap-2 sm:grid-cols-2">
										{BRAINSTORM_ASSISTS.map((assist) => (
											<button
												key={assist.label}
												type="button"
												onClick={() =>
													onDraftChange(draft ? `${draft}\n\n${assist.append}` : assist.append)
												}
												className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:border-orange-300 hover:bg-orange-50"
											>
												{assist.label}
											</button>
										))}
								</div>
								<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
									<p className="text-sm text-slate-500">
										{voiceStatus === "Voice input ready."
											? "You can type, paste a URL, or use voice."
											: voiceStatus}
									</p>
									<div className="flex flex-wrap gap-2">
										<button
											className="secondary-button flex items-center justify-center gap-2"
											type="button"
											onClick={onToggleVoice}
											disabled={isSending}
										>
											<Mic className="size-4" />
											{isListening ? "Stop Voice" : "Voice"}
										</button>
										<button
											className="primary-button flex items-center justify-center gap-2"
											type="button"
											onClick={onSend}
											disabled={isSending}
										>
											<ArrowRight className="size-4" />
											Send
										</button>
									</div>
								</div>
							</div>
						</div>
					</div>
				</section>

				<div className="space-y-4">
					<section className="glass-card p-5">
						<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
							<div>
								<div className="section-chip">What this does</div>
								<h2 className="mt-3 font-serif text-3xl text-slate-900">
									Understand the idea in one pass
								</h2>
								<p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
									LaunchLens is useful when an engineer, founder, or reviewer wants the first strong
									read: what this app is, what already exists, why it belongs on Cloudflare, and what
									to hand to the next builder.
								</p>
							</div>
							<StatusPill state={workflowStatus} error={currentState?.workflowStatus.error ?? null} />
						</div>
						<div className="mt-5 rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(248,250,252,0.95))] p-4 sm:p-5">
							<div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
								<div>
									<div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
										Audit flow
									</div>
									<h3 className="mt-2 font-serif text-2xl text-slate-900">
										Brief to audit to Cloudflare plan
									</h3>
									<p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
										Watch the workflow move from idea input to sources, synthesis, and final build handoff.
									</p>
								</div>
								<div className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white">
									{workflowStatus === "running"
										? "Audit in progress: watch the stages complete below."
										: workflowStatus === "complete"
											? "Audit finished: open Build on Cloudflare or Launch Page."
											: "Ready: send an idea, then run the audit."}
								</div>
							</div>
							<div className="mt-4">
								<ResearchStageRail
									researchStatus={researchStatus}
									workflowStatus={workflowStatus}
								/>
							</div>
						</div>
						<div className="mt-5 grid gap-4 md:grid-cols-3">
							<PipelineCard
								title="Step 1: Sources"
								value={String(currentState?.competitorUrls?.length ?? 0)}
								copy="LaunchLens suggests likely competitors from the idea automatically."
								icon={<Globe2 className="size-5 text-emerald-700" />}
							/>
							<PipelineCard
								title="Step 2: Audit"
								value={`${researchStatus?.completedCompetitors ?? 0}/${researchStatus?.totalCompetitors ?? 0}`}
								copy={
									researchStatus?.stage
										? `Stage: ${researchStatus.stage}`
										: "Describe the idea to start the audit."
								}
								icon={<Search className="size-5 text-orange-700" />}
							/>
							<PipelineCard
								title="Step 3: Build"
								value={currentState?.cloudflarePlan ? "Recommended" : "Still forming"}
								copy={
									currentState?.cloudflarePlan?.summary ||
									"Run the audit when the brief looks right and LaunchLens will recommend the Cloudflare shape."
								}
								icon={<Radar className="size-5 text-sky-700" />}
							/>
						</div>
						<div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
							{hasUserMessage ? (
								<BriefSnapshotCard
									ideaName={currentState?.ideaName}
									oneLiner={currentState?.oneLiner}
									targetUser={currentState?.targetUser}
									recommendedWedge={currentState?.recommendedWedge}
									workflowStatus={workflowStatus}
								/>
							) : (
								<PlaceholderCard
									title="Current read appears here"
									copy="After the first message, LaunchLens will summarize the idea, identify the user, and show the first product read here."
								/>
							)}
							<div className="panel-card space-y-3 p-4">
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div className="flex items-center gap-2">
										<Globe2 className="size-4 text-emerald-700" />
										<h3 className="font-semibold text-slate-900">Market sources</h3>
										<span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
											{currentState?.competitorUrls?.length ?? 0} saved
										</span>
									</div>
									<div className="flex items-center gap-3">
										<button
											type="button"
											onClick={() => setShowCompetitorEditor((value) => !value)}
											className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 transition hover:text-slate-900"
										>
											{showCompetitorEditor ? "Hide editor" : "Edit sources"}
										</button>
										{canClearCompetitors ? (
											<button
												type="button"
												onClick={onClearCompetitors}
												className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 transition hover:text-slate-900"
											>
												Clear
											</button>
										) : null}
									</div>
								</div>
								<p className="text-sm leading-6 text-slate-600">
									LaunchLens suggests likely public sources after the first idea message. Edit them only if you want to steer the audit.
								</p>
								<div className="flex flex-wrap gap-2">
									{(currentState?.competitorUrls ?? []).map((url) => (
										<span
											key={url}
											className="inline-flex max-w-full items-center gap-2 rounded-full bg-emerald-100 px-3 py-2 text-xs font-medium text-emerald-800"
										>
											<span className="max-w-[190px] truncate sm:max-w-[240px]" title={url}>
												{url}
											</span>
											<button
												type="button"
												onClick={() => onRemoveCompetitor(url)}
												className="rounded-full bg-emerald-200/80 p-1 text-emerald-900 transition hover:bg-emerald-300"
												aria-label={`Remove ${url}`}
											>
												<X className="size-3" />
											</button>
										</span>
									))}
									{currentState?.competitorUrls?.length ? null : (
										<span className="text-sm text-slate-500">No sources saved yet.</span>
									)}
								</div>
								{showCompetitorEditor ? (
									<div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
										<textarea
											value={competitorInput}
											onChange={(event) => onCompetitorInputChange(event.target.value)}
											rows={2}
											placeholder="Paste competitor URLs separated by commas or new lines..."
											className="w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
										/>
										<button className="secondary-button" type="button" onClick={onAddCompetitors}>
											Add URLs
										</button>
									</div>
								) : null}
								{competitorStatus ? (
									<p className="text-sm text-emerald-700">{competitorStatus}</p>
								) : null}
								{showCompetitorEditor || !(currentState?.competitorUrls?.length ?? 0) ? (
									<div className="flex flex-wrap gap-2">
										{SAMPLE_COMPETITOR_URLS.map((url) => (
											<button
												key={url}
												type="button"
												onClick={() => onUseSampleCompetitor(url)}
												className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50"
											>
												Use {url.replace(/^https?:\/\//, "")}
											</button>
										))}
									</div>
								) : null}
							</div>
						</div>
						<div className="mt-5 flex flex-wrap gap-2">
							{[
								{ key: "overview", label: "Summary" },
								{ key: "market", label: "Competition" },
								{ key: "build", label: "Build on Cloudflare" },
								{ key: "prototype", label: "Launch Page" },
							].map((tab) => (
								<button
									key={tab.key}
									type="button"
									onClick={() =>
										setActiveView(tab.key as "overview" | "market" | "build" | "prototype")
									}
									className={[
										"rounded-full px-4 py-2 text-sm font-medium transition",
										activeView === tab.key
											? "bg-slate-900 text-white"
											: "bg-slate-100 text-slate-700 hover:bg-slate-200",
									].join(" ")}
								>
									{tab.label}
								</button>
							))}
						</div>
					</section>

					{activeView === "overview" ? (
						<section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_340px]">
							<div className="glass-card p-5">
								<div className="section-chip">Current brief</div>
								<div className="mt-4 grid gap-3 md:grid-cols-2">
									<MemoryField label="Idea name" value={currentState?.ideaName} />
									<MemoryField label="One-liner" value={currentState?.oneLiner} />
									<MemoryField label="Target user" value={currentState?.targetUser} />
									<MemoryField label="Problem" value={currentState?.problem} />
								</div>
								<div className="mt-4 grid gap-4 lg:grid-cols-2">
									<div className="panel-card p-4">
										<div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">
											Best current wedge
										</div>
										<p className="mt-3 text-base leading-7 text-slate-800">
											{currentState?.recommendedWedge ||
												"Run the audit and LaunchLens will tell you the cleanest wedge to lead with."}
										</p>
									</div>
									<div className="panel-card p-4">
										<div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
											Next move
										</div>
										<p className="mt-3 text-base leading-7 text-slate-800">
											{readiness.nextAction}
										</p>
									</div>
								</div>
							</div>

							<div className="space-y-4">
									<div className="glass-card p-5">
										<div className="section-chip">Founder brief</div>
									<div className="mt-4 flex items-center justify-between gap-3">
										<h3 className="font-serif text-2xl text-slate-900">Quick handoff</h3>
										<button
											type="button"
											onClick={() => void copyToClipboard(buildFounderBrief(currentState))}
											className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 transition hover:bg-slate-200"
										>
											<Copy className="size-3.5" />
											Copy
										</button>
									</div>
										<p className="mt-3 max-h-[168px] overflow-hidden text-sm leading-7 text-slate-700">
											{readiness.founderBriefPreview}
										</p>
									</div>
									<div className="glass-card p-5">
										<div className="section-chip">Cloudflare read</div>
										<h3 className="mt-4 font-serif text-2xl text-slate-900">Why this fits</h3>
										<p className="mt-3 text-sm leading-7 text-slate-700">
											{currentState?.cloudflarePlan?.summary ||
												"After the audit, LaunchLens will explain why this product belongs on Cloudflare and which services should power the first version."}
										</p>
										{currentState?.cloudflarePlan?.services?.length ? (
											<div className="mt-4">
												<div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
													Recommended services
												</div>
												<div className="mt-3 flex flex-wrap gap-2">
													{currentState.cloudflarePlan.services.slice(0, 4).map((service) => (
														<span
															key={service.service}
															className="rounded-full bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-800"
														>
															{service.service}
														</span>
													))}
												</div>
											</div>
										) : null}
										{currentState?.cloudflarePlan?.edgeAdvantage ? (
											<div className="mt-4 rounded-2xl bg-slate-50 px-4 py-4">
												<div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
													Edge advantage
												</div>
												<p className="mt-2 text-sm leading-6 text-slate-700">
													{currentState.cloudflarePlan.edgeAdvantage}
												</p>
											</div>
										) : null}
									</div>
							</div>
						</section>
					) : null}

					{activeView === "market" ? (
						<section className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_360px]">
							<div className="glass-card p-5">
								<div className="section-chip">Competitor scan</div>
								<h2 className="mt-3 font-serif text-3xl text-slate-900">What LaunchLens found</h2>
								<div className="mt-5 grid gap-4 xl:grid-cols-2">
									{currentState?.competitorResearch?.length ? (
										currentState.competitorResearch.map((profile) => (
											<CompetitorCard key={profile.url} profile={profile} />
										))
									) : (
										<PlaceholderCard
											title="Sources appear here"
											copy="Describe the idea, let LaunchLens suggest likely competitors, then run the scan to see the market map."
										/>
									)}
								</div>
							</div>
							<div className="space-y-4">
								<div className="glass-card p-5">
									<div className="section-chip">Market read</div>
									<div className="mt-4 space-y-3">
										{currentState?.marketInsights?.length ? (
											currentState.marketInsights.map((insight) => (
												<InsightCard
													key={`${insight.title}-${insight.description}`}
													title={insight.title}
													description={insight.description}
												/>
											))
										) : (
											<PlaceholderCard
												title="Whitespace shows up here"
												copy="After the scan, this panel explains the category pattern, likely whitespace, and the strongest positioning angle."
											/>
										)}
									</div>
								</div>
								<div className="glass-card p-5">
									<div className="section-chip">Research notes</div>
									<div className="mt-4 space-y-3">
										{currentState?.researchErrors?.length ? (
											currentState.researchErrors.map((error) => (
												<div key={error} className="panel-card border-rose-200 bg-rose-50 p-4">
													<p className="text-sm leading-6 text-rose-700">{error}</p>
												</div>
											))
										) : (
											<p className="text-sm leading-6 text-slate-500">
												Any fetch or extraction issues appear here without blocking the rest of the market read.
											</p>
										)}
									</div>
								</div>
							</div>
						</section>
					) : null}

					{activeView === "build" ? (
						<section className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_360px]">
							<div className="glass-card p-5">
								<div className="section-chip">Build on Cloudflare</div>
								<h2 className="mt-3 font-serif text-3xl text-slate-900">
									How this should be built
								</h2>
								<p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
									This turns the product idea into a practical Cloudflare-native build shape, so the
									output is useful to an engineer reviewing the concept, not just to a founder.
								</p>
								{currentState?.cloudflarePlan ? (
									<div className="mt-5 space-y-4">
										<SummaryCard
											title="Recommended shape"
											value={currentState.cloudflarePlan.summary}
										/>
										<SummaryCard
											title="Architecture"
											value={currentState.cloudflarePlan.architecture}
										/>
										<div className="grid gap-4 xl:grid-cols-2">
											{currentState.cloudflarePlan.services.map((service) => (
												<div key={service.service} className="panel-card p-5">
													<h3 className="font-serif text-2xl text-slate-900">
														{service.service}
													</h3>
													<p className="mt-3 text-sm leading-6 text-slate-700">
														{service.why}
													</p>
												</div>
											))}
										</div>
										<div className="grid gap-4">
											<PromptCard
												label="Product spec for a builder"
												value={currentState?.implementationKit?.productSpec ?? ""}
											/>
											<PromptCard
												label="Prompt for a coding agent"
												value={currentState?.implementationKit?.codingPrompt ?? ""}
											/>
											<PromptCard
												label="Solutions-engineer brief"
												value={currentState?.implementationKit?.agentPrompt ?? ""}
											/>
										</div>
										<div className="flex flex-wrap gap-3">
											<button
												type="button"
												onClick={() =>
													void copyToClipboard(buildImplementationKitBundle(currentState))
												}
												className="secondary-button flex items-center gap-2"
											>
												<Copy className="size-4" />
												Copy Full Build Kit
											</button>
											<button
												type="button"
												onClick={() => downloadImplementationKit(currentState)}
												className="secondary-button flex items-center gap-2"
											>
												<FileStack className="size-4" />
												Export Build Kit
											</button>
										</div>
										<div className="grid gap-3 md:grid-cols-3">
										<ActionCard
											title="Paste into a coding agent"
											copy="Use the exported markdown file as the single source of truth for the first build."
										/>
											<ActionCard
												title="Brief another engineer"
												copy="Share the Cloudflare architecture, service picks, and starter tasks without re-explaining the concept."
											/>
											<ActionCard
												title="Review the stack"
												copy="Use the architecture and edge-advantage notes to sanity-check whether the product belongs on Cloudflare."
											/>
										</div>
									</div>
								) : (
									<PlaceholderCard
										title="Cloudflare plan appears here"
										copy="After analysis, LaunchLens recommends which Cloudflare services should power the first version and why."
									/>
								)}
							</div>
								<div className="space-y-4">
									<div className="glass-card border-orange-200 bg-[linear-gradient(180deg,rgba(255,244,238,0.96),rgba(255,250,247,0.96))] p-5">
										<div className="section-chip">Why the handoff matters</div>
										<h3 className="mt-3 font-serif text-2xl text-slate-900">
											The markdown file is meant for the next builder
										</h3>
										<p className="mt-3 text-sm leading-7 text-slate-700">
											Exporting the build kit gives you one clean markdown artifact with the product
											spec, Cloudflare architecture, starter tasks, and coding prompt. Paste it into
											a coding agent or share it with another engineer to start implementation
											without rewriting the brief from scratch.
										</p>
									</div>
								<div className="glass-card p-5">
									<div className="section-chip">Edge advantage</div>
									<SummaryCard
										title="Why Cloudflare fits"
										value={currentState?.cloudflarePlan?.edgeAdvantage ?? ""}
									/>
								</div>
								<div className="glass-card p-5">
									<div className="section-chip">Launch sequence</div>
									<ListMemoryField
										label="Recommended rollout"
										values={currentState?.cloudflarePlan?.launchSequence ?? []}
									/>
								</div>
								<div className="glass-card p-5">
									<div className="section-chip">Builder tasks</div>
									<ListMemoryField
										label="First implementation steps"
										values={currentState?.implementationKit?.starterTasks ?? []}
									/>
								</div>
								<div className="glass-card p-5">
									<div className="section-chip">Use this now</div>
									<div className="mt-4 space-y-3">
										<ActionCard
											title="Best handoff format"
											copy="The markdown export is the best input for another LLM because it preserves the architecture, prompts, and tasks in one place."
										/>
										<ActionCard
											title="Best review format"
											copy="The Cloudflare plan is the fastest way for a reviewer to judge whether the architecture choice is thoughtful."
										/>
									</div>
								</div>
							</div>
						</section>
					) : null}

					{activeView === "prototype" ? (
						<section className="grid gap-4 2xl:grid-cols-[minmax(0,1.05fr)_360px]">
							<div className="glass-card p-5">
								<div className="flex items-center gap-3">
									<div className="section-chip">Interactive Launch Page</div>
									{currentState?.websitePrototype?.html ? (
										<span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
											Generated from the market scan
										</span>
									) : null}
								</div>
								{currentState?.websitePrototype?.html ? (
									<div className="mt-4 space-y-4">
										<div className="panel-card p-5">
											<h3 className="font-serif text-3xl text-slate-900">
												{currentState.websitePrototype.title}
											</h3>
											<p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
												{currentState.websitePrototype.summary}
											</p>
										</div>
										<div className="overflow-hidden rounded-[28px] border border-orange-100 bg-[linear-gradient(180deg,rgba(255,240,232,0.96),rgba(255,247,241,0.92))] p-4">
											<div className="mb-3 flex items-center justify-between rounded-[18px] border border-slate-200 bg-white/90 px-4 py-3">
												<div className="flex items-center gap-2">
													<span className="size-2.5 rounded-full bg-rose-400" />
													<span className="size-2.5 rounded-full bg-amber-400" />
													<span className="size-2.5 rounded-full bg-emerald-400" />
												</div>
												<div className="truncate text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
													Live HTML launch page
												</div>
											</div>
											<iframe
												title="Generated launch page"
												srcDoc={currentState.websitePrototype.html}
												sandbox="allow-scripts"
												className="h-[620px] w-full rounded-[24px] border border-slate-200 bg-white"
											/>
										</div>
										<div className="flex flex-wrap items-center gap-3">
											<button
												type="button"
												onClick={() =>
													downloadPrototypeHtml(
														currentState.websitePrototype?.title ?? "concept-page",
														currentState.websitePrototype?.html ?? "",
													)
												}
												className="secondary-button flex items-center gap-2"
											>
												<Download className="size-4" />
												Download HTML
											</button>
											<button
												type="button"
												onClick={() => downloadMarketBrief(currentState)}
												className="secondary-button flex items-center gap-2"
											>
												<FileStack className="size-4" />
												Export Brief
											</button>
										</div>
										<div className="grid gap-3 md:grid-cols-3">
											<ActionCard
												title="Open the launch page"
												copy="Use the HTML output as the fastest way to review the pitch and first user flow."
											/>
											<ActionCard
												title="Download and iterate"
												copy="Save the HTML, tweak the copy or layout, and turn it into the first landing-page pass."
											/>
											<ActionCard
												title="Pair it with the build kit"
												copy="The HTML shows the surface; the markdown handoff explains how to actually build the product."
											/>
										</div>
									</div>
								) : (
									<PlaceholderCard
										title="Launch page appears here"
										copy="After the audit, LaunchLens turns the positioning into an interactive launch page and launch-ready copy."
									/>
								)}
							</div>

							<div className="space-y-4">
								<div className="glass-card border-sky-200 bg-[linear-gradient(180deg,rgba(239,246,255,0.95),rgba(248,250,252,0.96))] p-5">
									<div className="section-chip bg-sky-100 text-sky-800">Why the HTML matters</div>
									<h3 className="mt-3 font-serif text-2xl text-slate-900">
										This HTML opens as an interactive launch page
									</h3>
									<p className="mt-3 text-sm leading-7 text-slate-700">
										The HTML is useful because it gives the reviewer or teammate something to open,
										click through, and react to immediately. It is still not the full product, but
										it is a better review artifact than a plain description because it shows the
										pitch, first user flow, and Cloudflare fit in one place.
									</p>
								</div>
								<div className="glass-card p-5">
									<div className="section-chip">Positioning</div>
									<h3 className="mt-3 font-serif text-2xl text-slate-900">How this should stand out</h3>
									<p className="mt-3 text-base leading-7 text-slate-700">
										{currentState?.recommendedWedge ||
											"The recommendation appears here after the market scan finishes."}
									</p>
									{currentState?.differentiation ? (
										<div className="mt-4 space-y-3">
											<InsightCard
												title="Headline"
												description={currentState.differentiation.headline}
											/>
											<InsightCard
												title="Why it wins"
												description={currentState.differentiation.whyItWins}
											/>
										</div>
									) : null}
								</div>
								<div className="glass-card p-5">
									<div className="section-chip">Launch plan</div>
									<div className="mt-4 grid gap-4">
										<SummaryCard title="Summary" value={currentState?.launchBrief?.summary ?? ""} />
										<SummaryCard title="Launch strategy" value={currentState?.launchBrief?.launchStrategy ?? ""} />
										<SummaryCard title="Success metric" value={currentState?.launchBrief?.successMetric ?? ""} />
									</div>
								</div>
								<div className="glass-card p-5">
									<div className="section-chip">Action kit</div>
									<div className="mt-4 space-y-3">
										<MessagingKitCard
											label="Homepage headline"
											value={currentState?.messagingKit?.homepageHeadline ?? ""}
										/>
										<MessagingKitCard
											label="Elevator pitch"
											value={currentState?.messagingKit?.elevatorPitch ?? ""}
										/>
										<ListMemoryField label="First validation steps" values={currentState?.validationPlan ?? []} />
									</div>
								</div>
								<div className="glass-card p-5">
									<div className="section-chip">Best next step</div>
									<ListMemoryField
										label="Use the output in this order"
										values={[
											"Review the positioning and Cloudflare fit.",
											"Export the markdown brief for a builder or coding agent.",
											"Use the HTML launch page as the first visual artifact.",
										]}
									/>
								</div>
							</div>
						</section>
					) : null}
				</div>
			</div>
		</div>
	);
}

function StoryCard({
	icon,
	title,
	copy,
}: {
	icon: ReactNode;
	title: string;
	copy: string;
}) {
	return (
		<div className="panel-card p-5">
			<div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-slate-100">
				{icon}
			</div>
			<h3 className="font-serif text-xl text-slate-900">{title}</h3>
			<p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p>
		</div>
	);
}

function AudiencePill({
	label,
	tone,
}: {
	label: string;
	tone: "emerald" | "orange" | "slate";
}) {
	const className =
		tone === "emerald"
			? "bg-emerald-100 text-emerald-800"
			: tone === "orange"
				? "bg-orange-100 text-orange-800"
				: "bg-slate-100 text-slate-700";

	return (
		<span className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${className}`}>
			{label}
		</span>
	);
}

function InfoCard({ title, copy }: { title: string; copy: string }) {
	return (
		<div className="panel-card p-5 transition hover:-translate-y-0.5">
			<h3 className="font-serif text-xl text-slate-900">{title}</h3>
			<p className="mt-2 text-sm leading-7 text-slate-600">{copy}</p>
		</div>
	);
}

function AssignmentCoverageRow({
	title,
	copy,
}: {
	title: string;
	copy: string;
}) {
	return (
		<div className="rounded-2xl bg-slate-50 px-4 py-4">
			<div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
				{title}
			</div>
			<p className="mt-2 text-sm leading-6 text-slate-700">{copy}</p>
		</div>
	);
}

function PipelineCard({
	copy,
	icon,
	title,
	value,
}: {
	copy: string;
	icon: ReactNode;
	title: string;
	value: string;
}) {
	return (
		<div className="panel-card p-5 transition hover:-translate-y-0.5">
			<div className="flex items-center justify-between gap-3">
				<div className="font-medium text-slate-700">{title}</div>
				<div className="flex size-10 items-center justify-center rounded-2xl bg-slate-100">
					{icon}
				</div>
			</div>
			<div className="mt-4 font-serif text-3xl text-slate-900">{value}</div>
			<p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p>
		</div>
	);
}

function MessageBubble({
	content,
	isStreaming = false,
	role,
}: {
	content: string;
	isStreaming?: boolean;
	role: "user" | "assistant";
}) {
	return (
		<article
			className={[
				"relative rounded-[24px] border p-5 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.45)]",
				role === "assistant"
					? "border-slate-200 bg-white/90"
					: "border-orange-200 bg-[linear-gradient(135deg,rgba(255,237,213,0.9),rgba(255,247,237,0.95))]",
			].join(" ")}
		>
			<div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">
				{role === "assistant" ? "LaunchLens" : "You"}
			</div>
			<MarkdownContent source={content} />
			{isStreaming ? (
				<div className="absolute inset-x-4 -bottom-1 h-0.5 animate-pulse bg-gradient-to-r from-transparent via-orange-500 to-transparent" />
			) : null}
		</article>
	);
}

function PlaceholderCard({ title, copy }: { title: string; copy: string }) {
	return (
		<div className="panel-card p-6">
			<h3 className="font-serif text-2xl text-slate-900">{title}</h3>
			<p className="mt-3 text-base leading-8 text-slate-600">{copy}</p>
		</div>
	);
}

function SummaryCard({ title, value }: { title: string; value: string }) {
	return (
		<div className="panel-card p-5">
			<h3 className="font-serif text-xl text-slate-900">{title}</h3>
			<div className="mt-3">
				{value ? (
					<MarkdownContent source={value} />
				) : (
					<p className="text-sm leading-6 text-slate-500">This fills in after analysis runs.</p>
				)}
			</div>
		</div>
	);
}

function InsightCard({ title, description }: { title: string; description: string }) {
	return (
		<div className="panel-card p-4">
			<h4 className="font-semibold text-slate-900">{title}</h4>
			<p className="mt-2 text-sm leading-6 text-slate-700">{description}</p>
		</div>
	);
}

function ActionCard({ title, copy }: { title: string; copy: string }) {
	return (
		<div className="rounded-[24px] border border-slate-200 bg-white/80 px-4 py-4 shadow-[0_12px_28px_-26px_rgba(15,23,42,0.45)]">
			<h4 className="font-semibold text-slate-900">{title}</h4>
			<p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p>
		</div>
	);
}

function CapabilityTile({
	copy,
	title,
	tone,
}: {
	copy: string;
	title: string;
	tone: "emerald" | "sky" | "orange" | "slate";
}) {
	const toneClass =
		tone === "emerald"
			? "bg-emerald-50 border-emerald-200"
			: tone === "sky"
				? "bg-sky-50 border-sky-200"
				: tone === "orange"
					? "bg-orange-50 border-orange-200"
					: "bg-slate-50 border-slate-200";

	return (
		<div className={`rounded-[22px] border px-4 py-4 ${toneClass}`}>
			<h4 className="font-semibold text-slate-900">{title}</h4>
			<p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p>
		</div>
	);
}

function BriefSnapshotCard({
	ideaName,
	oneLiner,
	recommendedWedge,
	targetUser,
	workflowStatus,
}: {
	ideaName?: string | null;
	oneLiner?: string | null;
	recommendedWedge?: string | null;
	targetUser?: string | null;
	workflowStatus: ProjectState["workflowStatus"]["status"];
}) {
	const statusCopy =
		workflowStatus === "running"
			? "Audit is running now."
			: workflowStatus === "complete"
				? "Audit is ready. Review the build and launch tabs."
				: "Send another turn or run the audit when the brief looks right.";

	return (
		<div className="panel-card border-orange-200 bg-[linear-gradient(180deg,rgba(255,249,244,0.92),rgba(255,255,255,0.9))] p-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">
						Current read
					</div>
					<h3 className="mt-2 font-serif text-xl text-slate-900">
						{ideaName || "Working title forming"}
					</h3>
				</div>
				<div className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-600">
					{workflowStatus === "running"
						? "Running"
						: workflowStatus === "complete"
							? "Ready"
							: "Draft"}
				</div>
			</div>
			<p className="mt-3 text-sm leading-6 text-slate-700">
				{oneLiner || "LaunchLens will turn the first message into a sharper one-line product read."}
			</p>
			<div className="mt-3 flex flex-wrap gap-2">
				{targetUser ? (
					<span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700">
						User: {truncateInline(targetUser, 54)}
					</span>
				) : null}
				{recommendedWedge ? (
					<span className="rounded-full bg-emerald-100 px-3 py-2 text-xs font-medium text-emerald-800">
						Wedge: {truncateInline(recommendedWedge, 58)}
					</span>
				) : null}
			</div>
			<p className="mt-3 text-xs leading-5 text-slate-500">{statusCopy}</p>
		</div>
	);
}

function MemoryField({ label, value }: { label: string; value?: string | null }) {
	return (
		<div className="panel-card p-4">
			<h4 className="font-semibold text-slate-900">{label}</h4>
			<p className="mt-2 text-sm leading-6 text-slate-700">
				{value || "This fills in as the conversation sharpens."}
			</p>
		</div>
	);
}

function ListMemoryField({ label, values }: { label: string; values: string[] }) {
	return (
		<div className="panel-card p-4">
			<h4 className="font-semibold text-slate-900">{label}</h4>
			{values.length ? (
				<ul className="mt-3 space-y-2 text-sm text-slate-700">
					{values.map((item) => (
						<li key={item} className="flex gap-2">
							<CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
							<span>{item}</span>
						</li>
					))}
				</ul>
			) : (
				<p className="mt-2 text-sm leading-6 text-slate-500">
					This fills in as the conversation sharpens.
				</p>
			)}
		</div>
	);
}

function DecisionList({
	colorClass,
	label,
	values,
}: {
	colorClass: string;
	label: string;
	values: string[];
}) {
	if (values.length === 0) {
		return null;
	}

	return (
		<div className="rounded-2xl bg-slate-50 px-4 py-4">
			<div className={`text-xs font-semibold uppercase tracking-[0.18em] ${colorClass}`}>
				{label}
			</div>
			<ul className="mt-3 space-y-2 text-sm text-slate-700">
				{values.map((item) => (
					<li key={item} className="flex gap-2">
						<CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
						<span>{item}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

function MessagingKitCard({ label, value }: { label: string; value: string }) {
	return (
		<div className="panel-card p-4">
			<div className="flex items-center justify-between gap-3">
				<h4 className="font-semibold text-slate-900">{label}</h4>
				{value ? (
					<button
						type="button"
						onClick={() => void copyToClipboard(value)}
						className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 transition hover:bg-slate-200"
					>
						<Copy className="size-3.5" />
						Copy
					</button>
				) : null}
			</div>
			{value ? (
				<p className="mt-3 text-sm leading-7 text-slate-700">{value}</p>
			) : (
				<p className="mt-3 text-sm leading-6 text-slate-500">
					Analysis will generate this messaging asset.
				</p>
			)}
		</div>
	);
}

function PromptCard({ label, value }: { label: string; value: string }) {
	return (
		<div className="panel-card p-4">
			<div className="flex items-center justify-between gap-3">
				<h4 className="font-semibold text-slate-900">{label}</h4>
				{value ? (
					<button
						type="button"
						onClick={() => void copyToClipboard(value)}
						className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 transition hover:bg-slate-200"
					>
						<Copy className="size-3.5" />
						Copy
					</button>
				) : null}
			</div>
			{value ? (
				<div className="mt-3">
					<MarkdownContent source={value} />
				</div>
			) : (
				<p className="mt-3 text-sm leading-6 text-slate-500">
					LaunchLens will generate this build handoff after the audit runs.
				</p>
			)}
		</div>
	);
}

function CompetitorCard({ profile }: { profile: CompetitorProfile }) {
	return (
		<div className="panel-card p-5">
			<div className="flex items-start justify-between gap-3">
				<div>
					<h3 className="font-serif text-2xl text-slate-900">
						{profile.brandName || profile.hostname}
					</h3>
					<p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
						{profile.hostname}
					</p>
				</div>
				<span
					className={[
						"rounded-full px-3 py-1 text-xs font-semibold",
						profile.status === "complete"
							? "bg-emerald-100 text-emerald-700"
							: "bg-rose-100 text-rose-700",
					].join(" ")}
				>
					{profile.status === "complete" ? "Researched" : "Partial"}
				</span>
			</div>
			<a
				href={profile.url}
				target="_blank"
				rel="noreferrer"
				className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-emerald-700 transition hover:text-emerald-900"
			>
				<Globe2 className="size-4" />
				Open site
			</a>
			<p className="mt-3 text-sm leading-6 text-slate-700">{profile.summary}</p>
			<div className="mt-4 grid gap-3">
				{profile.positioning ? <InsightCard title="Positioning" description={profile.positioning} /> : null}
				{profile.targetAudience ? (
					<InsightCard title="Target audience" description={profile.targetAudience} />
				) : null}
				{profile.keyFeatures.length ? (
					<div className="panel-card p-4">
						<h4 className="font-semibold text-slate-900">Feature signals</h4>
						<ul className="mt-3 space-y-2 text-sm text-slate-700">
							{profile.keyFeatures.map((item) => (
								<li key={item} className="flex gap-2">
									<Sparkles className="mt-0.5 size-4 shrink-0 text-orange-500" />
									<span>{item}</span>
								</li>
							))}
						</ul>
					</div>
				) : null}
				{profile.pricingHints.length ? (
					<div className="panel-card p-4">
						<h4 className="font-semibold text-slate-900">Pricing cues</h4>
						<div className="mt-3 flex flex-wrap gap-2">
							{profile.pricingHints.map((item) => (
								<span
									key={item}
									className="rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700"
								>
									{item}
								</span>
							))}
						</div>
					</div>
				) : null}
				{profile.error ? (
					<div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
						{profile.error}
					</div>
				) : null}
			</div>
		</div>
	);
}

function StatusPill({
	error,
	state,
}: {
	error: string | null;
	state: ProjectState["workflowStatus"]["status"];
}) {
	const config =
		state === "running"
			? {
				label: "Running audit and build plan",
				chip: "bg-emerald-100 text-emerald-800",
				dot: "bg-emerald-500",
			}
			: state === "complete"
				? {
					label: "Audit ready",
					chip: "bg-orange-100 text-orange-800",
					dot: "bg-orange-500",
				}
				: state === "errored"
					? {
						label: error || "Audit failed",
						chip: "bg-rose-100 text-rose-800",
						dot: "bg-rose-500",
					}
					: {
						label: "Ready to audit",
						chip: "bg-slate-100 text-slate-700",
						dot: "bg-slate-400",
					};

	return (
		<div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${config.chip}`}>
			<span className={`size-2 rounded-full ${config.dot}`} />
			{config.label}
		</div>
	);
}

function ResearchStageRail({
	researchStatus,
	workflowStatus,
}: {
	researchStatus: ProjectState["researchStatus"] | null | undefined;
	workflowStatus: ProjectState["workflowStatus"]["status"];
}) {
	const activeStage =
		workflowStatus === "complete"
			? "complete"
			: researchStatus?.stage ?? "idle";
	const stages = [
		{
			key: "queued",
			label: "Queued",
			copy: "Session saved and workflow started.",
		},
		{
			key: "researching",
			label: "Researching",
			copy: "Scanning competitor pages and extracting signals.",
		},
		{
			key: "synthesizing",
			label: "Synthesizing",
			copy: "Turning the research into a wedge and strategy.",
		},
		{
			key: "complete",
			label: "Complete",
			copy: "Concept page and launch artifacts are ready.",
		},
	] as const;
	const stageOrder = ["idle", "queued", "researching", "synthesizing", "complete", "errored"];
	const activeIndex = Math.max(stageOrder.indexOf(activeStage), 0);

	return (
		<div className="grid gap-3 md:grid-cols-4">
			{stages.map((stage, index) => {
				const isActive = stage.key === activeStage;
				const isComplete = activeIndex > stageOrder.indexOf(stage.key);
				return (
					<div
						key={stage.key}
						className={[
							"panel-card p-4 transition",
							isActive
								? "border-orange-200 bg-orange-50/80"
								: isComplete
									? "border-emerald-200 bg-emerald-50/80"
									: "",
						].join(" ")}
					>
						<div className="flex items-center gap-3">
							<div
								className={[
									"flex size-8 items-center justify-center rounded-full text-xs font-semibold",
									isActive
										? "bg-orange-500 text-white"
										: isComplete
											? "bg-emerald-500 text-white"
											: "bg-slate-100 text-slate-500",
								].join(" ")}
							>
								{index + 1}
							</div>
							<div className="font-medium text-slate-900">{stage.label}</div>
						</div>
						<p className="mt-3 text-sm leading-6 text-slate-600">{stage.copy}</p>
					</div>
				);
			})}
		</div>
	);
}

function buildReadinessSummary(
	state: ProjectState | null,
	hasUserMessage: boolean,
): {
	score: number;
	statusLabel: string;
	nextAction: string;
	strongestAsset: string;
	evidenceLabel: string;
	useCase: string;
	founderBriefPreview: string;
	items: Array<{ label: string; complete: boolean; help: string }>;
} {
	const competitorCount = state?.competitorUrls.length ?? 0;
	const researchedCount = state?.competitorResearch.filter((item) => item.status === "complete").length ?? 0;
	const hasStructuredBrief = Boolean(
		state?.oneLiner || state?.targetUser || state?.problem || state?.solution,
	);
	const hasMarketView = Boolean(
		state?.marketInsights.length || state?.recommendedWedge || state?.differentiation,
	);
	const hasExecutionKit = Boolean(
		state?.websitePrototype?.html ||
			state?.validationPlan.length ||
			state?.decisionBoard ||
			state?.messagingKit ||
			state?.implementationKit,
	);

	const items = [
		{
			label: "Brief captured",
			complete: hasUserMessage && hasStructuredBrief,
			help: hasUserMessage
				? "The conversation has enough context to anchor product strategy."
				: "Describe the idea in one or two sentences so the agent can shape the brief.",
		},
		{
			label: "Competitor evidence saved",
			complete: competitorCount >= 2,
			help:
				competitorCount >= 2
					? `${competitorCount} competitor URL${competitorCount === 1 ? "" : "s"} are saved for market grounding.`
					: "LaunchLens will auto-suggest likely sources from the idea, and you can still edit them if needed.",
		},
		{
			label: "Market view synthesized",
			complete: hasMarketView,
			help: hasMarketView
				? "The agent has already identified whitespace and a positioning wedge."
				: "Run analysis to turn the brief and sources into whitespace, wedge, and messaging.",
		},
		{
			label: "Execution kit ready",
			complete: hasExecutionKit,
			help: hasExecutionKit
				? "Launch page, messaging, validation steps, and handoff assets are available."
				: "After synthesis, LaunchLens will generate the launch page, action kit, and messaging assets.",
		},
	];

	const completedCount = items.filter((item) => item.complete).length;
	const score = Math.round((completedCount / items.length) * 100);
	const workflowRunning = state?.workflowStatus.status === "running";

	let nextAction = "Describe the product idea in one or two sentences.";
	if (!hasUserMessage) {
		nextAction = "Describe the product idea in one or two sentences.";
	} else if (!hasStructuredBrief) {
		nextAction = "Add one more chat turn focused on who the user is and what pain you are solving.";
	} else if (competitorCount < 2) {
		nextAction = "Let LaunchLens suggest likely sources, then only edit them if you want to steer the audit.";
	} else if (workflowRunning) {
		nextAction = "Let the workflow finish researching the market and assembling the Cloudflare plan.";
	} else if (!hasMarketView) {
		nextAction = "Run Audit & Plan to generate the whitespace read, Cloudflare recommendation, and launch page.";
	} else if (!hasExecutionKit) {
		nextAction = "Use the generated wedge and Cloudflare plan to create the full execution kit and launch page.";
	} else {
		nextAction =
			"Export the brief or copy the outreach message, then start design-partner conversations this week.";
	}

	let strongestAsset = "The workspace is ready for the first product brief.";
	if (hasExecutionKit) {
		strongestAsset = "Launch page + execution kit are ready to share with a teammate or design partner.";
	} else if (hasMarketView) {
		strongestAsset = "The market angle is clear enough to guide product and messaging decisions.";
	} else if (researchedCount > 0) {
		strongestAsset = "Competitor evidence is already in memory, so the next synthesis will be grounded.";
	} else if (hasStructuredBrief) {
		strongestAsset = "The founder brief is solid enough to sharpen into a differentiated concept.";
	}

	const evidenceLabel =
		researchedCount > 0
			? `${researchedCount} researched source${researchedCount === 1 ? "" : "s"} plus durable session memory.`
			: competitorCount > 0
				? `${competitorCount} source${competitorCount === 1 ? "" : "s"} saved and ready for analysis.`
				: "No outside evidence yet. Add competitor URLs to ground the recommendation.";

	const useCase = hasExecutionKit
		? "Use this output to brief a teammate, pressure-test demand with prospects, or decide how the first version should run on Cloudflare."
		: hasMarketView
			? "Use the wedge and Cloudflare fit to decide what to build first and what not to build yet."
			: "Use the chat to clarify the niche, then let LaunchLens auto-scout the market before you run the full audit.";

	return {
		score,
		statusLabel:
			score === 100
				? "Ready to validate with real prospects"
				: score >= 75
					? "Strong concept, one more step to make it launch-ready"
					: score >= 50
						? "Good direction, but still missing evidence or synthesis"
						: "Early-stage concept that needs more grounding",
		nextAction,
		strongestAsset,
		evidenceLabel,
		useCase,
		founderBriefPreview: buildFounderBriefPreview(state),
		items,
	};
}

function createClientFallbackState(): ProjectState {
	return {
		revision: 0,
		messages: [],
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
	};
}

function buildFounderBriefPreview(state: ProjectState | null): string {
	if (!state) {
		return "No brief yet. Start with the user problem, then let the agent turn it into a sharper product direction.";
	}

	return (
		buildFounderBrief(state) ||
		"No brief yet. Start with the user problem, then let the agent turn it into a sharper product direction."
	);
}

function buildFounderBrief(state: ProjectState | null): string {
	if (!state) {
		return "";
	}

	const targetUser =
		state.targetUser &&
		!/early adopters described in the conversation/i.test(state.targetUser)
			? state.targetUser
			: "";
	const problem =
		state.problem && state.problem !== state.oneLiner ? state.problem : "";

	const sections = [
		state.ideaName ? `${state.ideaName}.` : "",
		state.oneLiner ? `One-line idea: ${state.oneLiner}` : "",
		targetUser ? `Target user: ${targetUser}.` : "",
		problem ? `Problem: ${problem}.` : "",
		state.recommendedWedge ? `Recommended wedge: ${state.recommendedWedge}` : "",
		state.differentiation?.headline
			? `Positioning headline: ${state.differentiation.headline}`
			: "",
		state.launchBrief?.successMetric
			? `Success metric: ${state.launchBrief.successMetric}`
			: "",
	]
		.filter(Boolean)
		.join(" ");

	return sections.trim();
}

function appendLocalAssistant(
	state: ProjectState | null,
	assistantMessage: string,
): ProjectState {
	const previousState = state ?? createClientFallbackState();
	return {
		...previousState,
		messages: [
			...previousState.messages,
			{ role: "assistant", content: assistantMessage },
		],
	};
}

function truncateInline(value: string, maxLength: number): string {
	const normalized = value.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxLength) {
		return normalized;
	}

	return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function consumeSseEvents(buffer: string): {
	events: string[];
	buffer: string;
} {
	let normalized = buffer.replace(/\r/g, "");
	const events: string[] = [];
	let eventBoundary = normalized.indexOf("\n\n");

	while (eventBoundary !== -1) {
		const rawEvent = normalized.slice(0, eventBoundary);
		normalized = normalized.slice(eventBoundary + 2);

		const lines = rawEvent.split("\n");
		const dataLines = lines
			.filter((line) => line.startsWith("data:"))
			.map((line) => line.slice("data:".length).trimStart());

		if (dataLines.length > 0) {
			events.push(dataLines.join("\n"));
		}

		eventBoundary = normalized.indexOf("\n\n");
	}

	return { events, buffer: normalized };
}

function isNearBottom(element: HTMLDivElement, threshold = 120): boolean {
	return element.scrollHeight - element.scrollTop - element.clientHeight < threshold;
}

async function safeJson(response: Response): Promise<unknown | null> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

function createSessionId(): string {
	return `session-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function createAndStoreSessionId(): string {
	const nextId = createSessionId();
	window.localStorage.setItem(SESSION_STORAGE_KEY, nextId);
	return nextId;
}

function getOrCreateSessionId(): string {
	const existing =
		typeof window !== "undefined"
			? window.localStorage.getItem(SESSION_STORAGE_KEY)
			: null;

	if (existing) {
		return existing;
	}

	if (typeof window === "undefined") {
		return createSessionId();
	}

	return createAndStoreSessionId();
}

function downloadPrototypeHtml(title: string, html: string) {
	if (typeof window === "undefined" || !html.trim()) {
		return;
	}

	const blob = new Blob([html], { type: "text/html;charset=utf-8" });
	const url = window.URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "launchlens-concept-page"}.html`;
	anchor.click();
	window.URL.revokeObjectURL(url);
}

function buildImplementationKitBundle(state: ProjectState | null): string {
	if (!state) {
		return "";
	}

	return [
		`# ${state.ideaName || "LaunchLens Build Kit"}`,
		"",
		"## Product Spec",
		state.implementationKit?.productSpec || "Not yet generated.",
		"",
		"## Cloudflare Summary",
		state.cloudflarePlan?.summary || "Not yet generated.",
		"",
		"## Architecture",
		state.cloudflarePlan?.architecture || "Not yet generated.",
		"",
		"## Recommended Services",
		...(state.cloudflarePlan?.services.length
			? state.cloudflarePlan.services.map(
					(service) => `- ${service.service}: ${service.why}`,
				)
			: ["- Not yet generated."]),
		"",
		"## Coding Prompt",
		state.implementationKit?.codingPrompt || "Not yet generated.",
		"",
		"## Solutions-Engineer Brief",
		state.implementationKit?.agentPrompt || "Not yet generated.",
		"",
		"## Starter Tasks",
		...(state.implementationKit?.starterTasks.length
			? state.implementationKit.starterTasks.map((item) => `- ${item}`)
			: ["- Not yet generated."]),
	].join("\n");
}

function downloadImplementationKit(state: ProjectState | null) {
	if (typeof window === "undefined" || !state) {
		return;
	}

	const contents = buildImplementationKitBundle(state);
	const blob = new Blob([contents], { type: "text/markdown;charset=utf-8" });
	const url = window.URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = `${(state.ideaName || "launchlens-build-kit").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-build-kit.md`;
	anchor.click();
	window.URL.revokeObjectURL(url);
}

function downloadMarketBrief(state: ProjectState | null) {
	if (typeof window === "undefined" || !state) {
		return;
	}

	const sections = [
		`# ${state.ideaName || "LaunchLens App Audit Brief"}`,
		"",
		"## One-liner",
		state.oneLiner || "Not yet defined.",
		"",
		"## Target User",
		state.targetUser || "Not yet defined.",
		"",
		"## Problem",
		state.problem || "Not yet defined.",
		"",
		"## Recommended Wedge",
		state.recommendedWedge || "Run the audit to generate this section.",
		"",
		"## Differentiation",
		state.differentiation?.headline || "Not yet generated.",
		state.differentiation?.whyItWins ? `\n${state.differentiation.whyItWins}` : "",
		"",
		"## Messaging Pillars",
		...(state.differentiation?.messagingPillars.length
			? state.differentiation.messagingPillars.map((item) => `- ${item}`)
			: ["- Not yet generated."]),
		"",
		"## Market Insights",
		...(state.marketInsights.length
			? state.marketInsights.map((insight) => `- **${insight.title}**: ${insight.description}`)
			: ["- No market insights yet."]),
		"",
		"## Build On Cloudflare",
		state.cloudflarePlan?.summary || "Not yet generated.",
		"",
		"### Architecture",
		state.cloudflarePlan?.architecture || "Not yet generated.",
		"",
		"### Recommended services",
		...(state.cloudflarePlan?.services.length
			? state.cloudflarePlan.services.map(
					(service) => `- **${service.service}**: ${service.why}`,
				)
			: ["- Not yet generated."]),
		"",
		"### Launch sequence",
		...(state.cloudflarePlan?.launchSequence.length
			? state.cloudflarePlan.launchSequence.map((item) => `- ${item}`)
			: ["- Not yet generated."]),
		"",
		"### Edge advantage",
		state.cloudflarePlan?.edgeAdvantage || "Not yet generated.",
		"",
		"## Implementation Kit",
		"### Product spec",
		state.implementationKit?.productSpec || "Not yet generated.",
		"",
		"### Prompt for a coding agent",
		state.implementationKit?.codingPrompt || "Not yet generated.",
		"",
		"### Solutions-engineer brief",
		state.implementationKit?.agentPrompt || "Not yet generated.",
		"",
		"### Starter tasks",
		...(state.implementationKit?.starterTasks.length
			? state.implementationKit.starterTasks.map((item) => `- ${item}`)
			: ["- Not yet generated."]),
		"",
		"## Competitor Matrix",
		...(state.competitorResearch.length
			? state.competitorResearch.map(
					(profile) =>
						`- **${profile.brandName || profile.hostname}** (${profile.url})\n  - Status: ${profile.status}\n  - Positioning: ${profile.positioning || profile.summary}`,
				)
			: ["- No competitor research yet."]),
		"",
		"## Launch Strategy",
		state.launchBrief?.launchStrategy || "Not yet generated.",
		"",
		"## Checklist",
		...(state.checklist.length ? state.checklist.map((item) => `- ${item}`) : ["- Not yet generated."]),
		"",
		"## Validation Plan",
		...(state.validationPlan.length
			? state.validationPlan.map((item) => `- ${item}`)
			: ["- Not yet generated."]),
		"",
		"## Customer Questions",
		...(state.customerQuestions.length
			? state.customerQuestions.map((item) => `- ${item}`)
			: ["- Not yet generated."]),
		"",
		"## Outreach Message",
		state.outreachMessage || "Not yet generated.",
		"",
		"## Messaging Kit",
		"### Homepage headline",
		state.messagingKit?.homepageHeadline || "Not yet generated.",
		"",
		"### Homepage subheadline",
		state.messagingKit?.homepageSubheadline || "Not yet generated.",
		"",
		"### Elevator pitch",
		state.messagingKit?.elevatorPitch || "Not yet generated.",
		"",
		"### Demo opener",
		state.messagingKit?.demoOpener || "Not yet generated.",
		"",
		"## Decision Board",
		...(state.decisionBoard?.buildNow.length
			? ["### Build now", ...state.decisionBoard.buildNow.map((item) => `- ${item}`)]
			: ["### Build now", "- Not yet generated."]),
		...(state.decisionBoard?.avoidNow.length
			? ["", "### Avoid for now", ...state.decisionBoard.avoidNow.map((item) => `- ${item}`)]
			: ["", "### Avoid for now", "- Not yet generated."]),
		...(state.decisionBoard?.proofPoints.length
			? ["", "### Proof to collect", ...state.decisionBoard.proofPoints.map((item) => `- ${item}`)]
			: ["", "### Proof to collect", "- Not yet generated."]),
		"",
		"### First sales motion",
		state.decisionBoard?.firstSalesMotion || "Not yet generated.",
	].join("\n");

	const blob = new Blob([sections], { type: "text/markdown;charset=utf-8" });
	const url = window.URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = `${(state.ideaName || "launchlens-market-brief").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.md`;
	anchor.click();
	window.URL.revokeObjectURL(url);
}

async function copyToClipboard(value: string) {
	if (typeof navigator === "undefined" || !value.trim()) {
		return;
	}

	try {
		await navigator.clipboard.writeText(value);
	} catch {
		// Best-effort convenience feature; no-op if clipboard access is blocked.
	}
}
