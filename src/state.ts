import {
	ChatMessage,
	CloudflarePlan,
	CompetitorProfile,
	DecisionBoard,
	DifferentiationStrategy,
	ForecastPoint,
	ImplementationKit,
	LaunchArtifacts,
	MarketInsight,
	MessagingKit,
	PitchDeckSlide,
	ProjectState,
	ResearchStatus,
	SnapshotExtraction,
	WebsitePrototype,
	WorkflowStatus,
} from "./types";

export const STATE_KEY = "project-state";

export const INITIAL_ASSISTANT_MESSAGE =
	"Paste an AI app idea or product URL. I'll sharpen the wedge, scout likely competitors, recommend the Cloudflare stack, and package a build handoff another engineer can actually use.";

function nowIso(): string {
	return new Date().toISOString();
}

function normalizeText(value: string | null | undefined): string {
	return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeList(values: string[] | null | undefined): string[] {
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

function normalizeCompetitorUrlList(values: string[]): string[] {
	const seen = new Set<string>();
	const output: string[] = [];

	for (const value of values) {
		const raw = normalizeText(value);
		if (!raw) {
			continue;
		}

		const maybeUrl = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

		try {
			const parsed = new URL(maybeUrl);
			if (!["http:", "https:"].includes(parsed.protocol)) {
				continue;
			}
			parsed.hash = "";
			parsed.search = "";
			parsed.hostname = parsed.hostname.replace(/^www\./i, "");
			const normalized = parsed.toString().replace(/\/$/, "");
			const key = normalized.toLowerCase();
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			output.push(normalized);
		} catch {
			continue;
		}
	}

	return output.slice(0, 5);
}

function mergeString(previous: string, incoming: string): string {
	return incoming ? incoming : previous;
}

function mergeList(previous: string[], incoming: string[]): string[] {
	return normalizeList([...previous, ...incoming]);
}

function createWorkflowStatus(
	overrides?: Partial<WorkflowStatus>,
): WorkflowStatus {
	return {
		status: "idle",
		workflowId: null,
		sourceRevision: null,
		error: null,
		updatedAt: null,
		...overrides,
	};
}

function createResearchStatus(
	overrides?: Partial<ResearchStatus>,
): ResearchStatus {
	return {
		stage: "idle",
		totalCompetitors: 0,
		completedCompetitors: 0,
		failedCompetitors: 0,
		updatedAt: null,
		...overrides,
	};
}

export function createDefaultState(): ProjectState {
	return {
		revision: 0,
		messages: [{ role: "assistant", content: INITIAL_ASSISTANT_MESSAGE }],
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
		researchStatus: createResearchStatus(),
		researchErrors: [],
		workflowStatus: createWorkflowStatus(),
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

export function resetState(): ProjectState {
	return createDefaultState();
}

function normalizeDeckSlides(
	slides: PitchDeckSlide[] | null | undefined,
): PitchDeckSlide[] {
	return (slides ?? [])
		.map((slide) => ({
			title: normalizeText(slide.title),
			headline: normalizeText(slide.headline),
			bullets: normalizeList(slide.bullets),
		}))
		.filter(
			(slide) =>
				slide.title.length > 0 ||
				slide.headline.length > 0 ||
				slide.bullets.length > 0,
		);
}

function normalizeForecast(
	points: ForecastPoint[] | null | undefined,
): ForecastPoint[] {
	return (points ?? [])
		.map((point) => ({
			label: normalizeText(point.label),
			value: Number.isFinite(point.value)
				? Math.max(0, Math.round(point.value))
				: 0,
		}))
		.filter((point) => point.label.length > 0);
}

function normalizeCompetitorProfiles(
	profiles: CompetitorProfile[] | null | undefined,
): CompetitorProfile[] {
	const seen = new Set<string>();

	return (profiles ?? [])
		.map<CompetitorProfile>((profile) => ({
			url: normalizeText(profile.url),
			hostname: normalizeText(profile.hostname),
			brandName: normalizeText(profile.brandName),
			title: normalizeText(profile.title),
			summary: normalizeText(profile.summary),
			positioning: normalizeText(profile.positioning),
			targetAudience: normalizeText(profile.targetAudience),
			pricingHints: normalizeList(profile.pricingHints),
			keyFeatures: normalizeList(profile.keyFeatures),
			cta: normalizeText(profile.cta),
			status: profile.status === "failed" ? "failed" : "complete",
			error: normalizeText(profile.error),
		}))
		.filter((profile) => {
			if (!profile.url) {
				return false;
			}

			const key = profile.url.toLowerCase();
			if (seen.has(key)) {
				return false;
			}
			seen.add(key);
			return true;
		});
}

function normalizeMarketInsights(
	insights: MarketInsight[] | null | undefined,
): MarketInsight[] {
	return (insights ?? [])
		.map((insight) => ({
			title: normalizeText(insight.title),
			description: normalizeText(insight.description),
		}))
		.filter((insight) => insight.title.length > 0 || insight.description.length > 0);
}

function normalizeDifferentiation(
	differentiation: DifferentiationStrategy | null | undefined,
): DifferentiationStrategy | null {
	if (!differentiation) {
		return null;
	}

	const headline = normalizeText(differentiation.headline);
	const whyItWins = normalizeText(differentiation.whyItWins);
	const messagingPillars = normalizeList(differentiation.messagingPillars);

	if (!headline && !whyItWins && messagingPillars.length === 0) {
		return null;
	}

	return {
		headline,
		whyItWins,
		messagingPillars,
	};
}

function normalizeDecisionBoard(
	decisionBoard: DecisionBoard | null | undefined,
): DecisionBoard | null {
	if (!decisionBoard) {
		return null;
	}

	const buildNow = normalizeList(decisionBoard.buildNow);
	const avoidNow = normalizeList(decisionBoard.avoidNow);
	const proofPoints = normalizeList(decisionBoard.proofPoints);
	const firstSalesMotion = normalizeText(decisionBoard.firstSalesMotion);

	if (
		buildNow.length === 0 &&
		avoidNow.length === 0 &&
		proofPoints.length === 0 &&
		!firstSalesMotion
	) {
		return null;
	}

	return {
		buildNow,
		avoidNow,
		proofPoints,
		firstSalesMotion,
	};
}

function normalizeMessagingKit(
	messagingKit: MessagingKit | null | undefined,
): MessagingKit | null {
	if (!messagingKit) {
		return null;
	}

	const homepageHeadline = normalizeText(messagingKit.homepageHeadline);
	const homepageSubheadline = normalizeText(messagingKit.homepageSubheadline);
	const elevatorPitch = normalizeText(messagingKit.elevatorPitch);
	const demoOpener = normalizeText(messagingKit.demoOpener);

	if (!homepageHeadline && !homepageSubheadline && !elevatorPitch && !demoOpener) {
		return null;
	}

	return {
		homepageHeadline,
		homepageSubheadline,
		elevatorPitch,
		demoOpener,
	};
}

function normalizeCloudflarePlan(
	cloudflarePlan: CloudflarePlan | null | undefined,
): CloudflarePlan | null {
	if (!cloudflarePlan) {
		return null;
	}

	const summary = normalizeText(cloudflarePlan.summary);
	const architecture = normalizeText(cloudflarePlan.architecture);
	const services = (cloudflarePlan.services ?? [])
		.map((service) => ({
			service: normalizeText(service.service),
			why: normalizeText(service.why),
		}))
		.filter((service) => service.service || service.why)
		.slice(0, 6);
	const launchSequence = normalizeList(cloudflarePlan.launchSequence).slice(0, 6);
	const edgeAdvantage = normalizeText(cloudflarePlan.edgeAdvantage);

	if (
		!summary &&
		!architecture &&
		services.length === 0 &&
		launchSequence.length === 0 &&
		!edgeAdvantage
	) {
		return null;
	}

	return {
		summary,
		architecture,
		services,
		launchSequence,
		edgeAdvantage,
	};
}

function normalizeImplementationKit(
	implementationKit: ImplementationKit | null | undefined,
): ImplementationKit | null {
	if (!implementationKit) {
		return null;
	}

	const productSpec = normalizeText(implementationKit.productSpec);
	const codingPrompt = normalizeText(implementationKit.codingPrompt);
	const agentPrompt = normalizeText(implementationKit.agentPrompt);
	const starterTasks = normalizeList(implementationKit.starterTasks).slice(0, 6);

	if (!productSpec && !codingPrompt && !agentPrompt && starterTasks.length === 0) {
		return null;
	}

	return {
		productSpec,
		codingPrompt,
		agentPrompt,
		starterTasks,
	};
}

function normalizeWebsitePrototype(
	prototype: WebsitePrototype | null | undefined,
): WebsitePrototype | null {
	if (!prototype) {
		return null;
	}

	const title = normalizeText(prototype.title);
	const summary = normalizeText(prototype.summary);
	const html = (prototype.html ?? "").trim();

	if (!title && !summary && !html) {
		return null;
	}

	return {
		title,
		summary,
		html,
	};
}

function resetArtifacts(
	state: ProjectState,
): Pick<
	ProjectState,
	| "marketInsights"
	| "recommendedWedge"
	| "differentiation"
	| "researchStatus"
	| "researchErrors"
	| "workflowStatus"
	| "launchBrief"
	| "checklist"
	| "validationPlan"
	| "customerQuestions"
	| "outreachMessage"
	| "decisionBoard"
	| "messagingKit"
	| "cloudflarePlan"
	| "implementationKit"
	| "pitchDeck"
	| "forecast"
	| "websitePrototype"
> {
	return {
		marketInsights: [],
		recommendedWedge: "",
		differentiation: null,
		researchStatus: createResearchStatus({
			totalCompetitors: state.competitorUrls.length,
			updatedAt: state.competitorUrls.length > 0 ? nowIso() : null,
		}),
		researchErrors: [],
		workflowStatus: createWorkflowStatus(),
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

function withRevision(state: ProjectState): ProjectState {
	return { ...state, revision: state.revision + 1 };
}

export function appendUserMessage(
	state: ProjectState,
	message: string,
): ProjectState {
	const normalized = normalizeText(message);
	if (!normalized) {
		return state;
	}

	return withRevision({
		...state,
		messages: [...state.messages, { role: "user", content: normalized }],
		...resetArtifacts(state),
	});
}

export function appendAssistantMessage(
	state: ProjectState,
	message: string,
): ProjectState {
	const normalized = normalizeText(message);
	if (!normalized) {
		return state;
	}

	return withRevision({
		...state,
		messages: [...state.messages, { role: "assistant", content: normalized }],
	});
}

export function mergeSnapshot(
	state: ProjectState,
	snapshot: SnapshotExtraction,
): ProjectState {
	const normalizedSnapshot: SnapshotExtraction = {
		ideaName: normalizeText(snapshot.ideaName),
		oneLiner: normalizeText(snapshot.oneLiner),
		targetUser: normalizeText(snapshot.targetUser),
		problem: normalizeText(snapshot.problem),
		solution: normalizeText(snapshot.solution),
		keyFeatures: normalizeList(snapshot.keyFeatures),
		mvpScope: normalizeList(snapshot.mvpScope),
		risks: normalizeList(snapshot.risks),
		openQuestions: normalizeList(snapshot.openQuestions),
	};

	const nextState: ProjectState = {
		...state,
		ideaName: mergeString(state.ideaName, normalizedSnapshot.ideaName),
		oneLiner: mergeString(state.oneLiner, normalizedSnapshot.oneLiner),
		targetUser: mergeString(state.targetUser, normalizedSnapshot.targetUser),
		problem: mergeString(state.problem, normalizedSnapshot.problem),
		solution: mergeString(state.solution, normalizedSnapshot.solution),
		keyFeatures: mergeList(state.keyFeatures, normalizedSnapshot.keyFeatures),
		mvpScope: mergeList(state.mvpScope, normalizedSnapshot.mvpScope),
		risks: mergeList(state.risks, normalizedSnapshot.risks),
		openQuestions: mergeList(state.openQuestions, normalizedSnapshot.openQuestions),
	};

	if (JSON.stringify(nextState) === JSON.stringify(state)) {
		return state;
	}

	return withRevision(nextState);
}

export function setCompetitorUrls(
	state: ProjectState,
	urls: string[],
): ProjectState {
	const normalizedUrls = normalizeCompetitorUrlList(urls);

	if (JSON.stringify(normalizedUrls) === JSON.stringify(state.competitorUrls)) {
		return state;
	}

	return withRevision({
		...state,
		competitorUrls: normalizedUrls,
		competitorResearch: [],
		...resetArtifacts({
			...state,
			competitorUrls: normalizedUrls,
		}),
	});
}

export function markWorkflowRunning(
	state: ProjectState,
	workflowId: string,
): ProjectState {
	return {
		...state,
		researchStatus: createResearchStatus({
			stage: state.competitorUrls.length > 0 ? "queued" : "synthesizing",
			totalCompetitors: state.competitorUrls.length,
			completedCompetitors: 0,
			failedCompetitors: 0,
			updatedAt: nowIso(),
		}),
		researchErrors: [],
		workflowStatus: createWorkflowStatus({
			status: "running",
			workflowId,
			sourceRevision: state.revision,
			error: null,
			updatedAt: nowIso(),
		}),
		launchBrief: null,
		checklist: [],
		pitchDeck: [],
		forecast: [],
		websitePrototype: null,
	};
}

export function updateResearchProgress(
	state: ProjectState,
	input: {
		stage?: ResearchStatus["stage"];
		profiles?: CompetitorProfile[];
		errors?: string[];
	},
): ProjectState {
	const profiles = normalizeCompetitorProfiles(
		input.profiles && input.profiles.length > 0
			? [...state.competitorResearch, ...input.profiles]
			: state.competitorResearch,
	);
	const errors = normalizeList([...(state.researchErrors ?? []), ...(input.errors ?? [])]);
	const failedCompetitors = profiles.filter((profile) => profile.status === "failed").length;
	const completedCompetitors = profiles.filter(
		(profile) => profile.status === "complete",
	).length;

	const nextState: ProjectState = {
		...state,
		competitorResearch: profiles,
		researchErrors: errors,
		researchStatus: createResearchStatus({
			stage: input.stage ?? state.researchStatus.stage,
			totalCompetitors: state.competitorUrls.length,
			completedCompetitors,
			failedCompetitors,
			updatedAt: nowIso(),
		}),
	};

	if (JSON.stringify(nextState) === JSON.stringify(state)) {
		return state;
	}

	return withRevision(nextState);
}

export function completeWorkflow(
	state: ProjectState,
	workflowId: string,
	sourceRevision: number,
	artifacts: LaunchArtifacts,
): ProjectState {
	if (
		state.workflowStatus.workflowId !== workflowId ||
		state.workflowStatus.sourceRevision !== sourceRevision
	) {
		return state;
	}

	return {
		...state,
		competitorResearch: normalizeCompetitorProfiles(artifacts.competitorResearch),
		marketInsights: normalizeMarketInsights(artifacts.marketInsights),
		recommendedWedge: normalizeText(artifacts.recommendedWedge),
		differentiation: normalizeDifferentiation(artifacts.differentiation),
		researchStatus: createResearchStatus({
			stage: "complete",
			totalCompetitors: state.competitorUrls.length,
			completedCompetitors: normalizeCompetitorProfiles(
				artifacts.competitorResearch,
			).filter((profile) => profile.status === "complete").length,
			failedCompetitors: normalizeCompetitorProfiles(
				artifacts.competitorResearch,
			).filter((profile) => profile.status === "failed").length,
			updatedAt: nowIso(),
		}),
		researchErrors: normalizeList(artifacts.researchErrors),
		workflowStatus: createWorkflowStatus({
			status: "complete",
			workflowId,
			sourceRevision,
			error: null,
			updatedAt: nowIso(),
		}),
		launchBrief: artifacts.launchBrief,
		checklist: normalizeList(artifacts.checklist),
		validationPlan: normalizeList(artifacts.validationPlan),
		customerQuestions: normalizeList(artifacts.customerQuestions),
		outreachMessage: normalizeText(artifacts.outreachMessage),
		decisionBoard: normalizeDecisionBoard(artifacts.decisionBoard),
		messagingKit: normalizeMessagingKit(artifacts.messagingKit),
		cloudflarePlan: normalizeCloudflarePlan(artifacts.cloudflarePlan),
		implementationKit: normalizeImplementationKit(artifacts.implementationKit),
		pitchDeck: normalizeDeckSlides(artifacts.pitchDeck),
		forecast: normalizeForecast(artifacts.forecast),
		websitePrototype: normalizeWebsitePrototype(artifacts.websitePrototype),
	};
}

function collectUserSignals(messages: ChatMessage[]): string[] {
	return messages
		.filter((message) => message.role === "user")
		.map((message) => normalizeText(message.content))
		.filter(Boolean);
}

function collectAssistantSignals(messages: ChatMessage[]): string[] {
	return messages
		.filter((message) => message.role === "assistant")
		.map((message) => normalizeText(message.content))
		.filter(Boolean);
}

function isGenericIdeaRequest(source: string): boolean {
	const normalized = normalizeText(source).toLowerCase();
	if (!normalized) {
		return false;
	}

	return [
		/\bgive me (?:a|an)?\s*(?:good|great|startup|product)?\s*idea\b/,
		/\bcome up with (?:a|an)?\s*(?:good|great|startup|product)?\s*idea\b/,
		/\bsuggest (?:a|an)?\s*(?:good|great|startup|product)?\s*idea\b/,
		/\bi need (?:a|an)?\s*(?:good|great|startup|product)?\s*idea\b/,
		/\bwhat should i build\b/,
		/\bwhat ai app should i build\b/,
		/\bcan become a unicorn\b/,
		/\bunicorn\b/,
	].some((pattern) => pattern.test(normalized));
}

function extractSuggestedIdeaName(source: string): string {
	const normalized = normalizeText(source);
	if (!normalized) {
		return "";
	}

	const patterns = [
		/(?:let'?s call it|call it|name it|called)\s+[“"]?([^"”.,\n]{2,50})[”"]?/i,
		/[“"]([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,3})[”"]/,
	];

	for (const pattern of patterns) {
		const match = normalized.match(pattern);
		const candidate = normalizeIdeaPhrase(match?.[1] ?? "");
		if (!candidate) {
			continue;
		}

		if (candidate.split(/\s+/).length <= 5) {
			return candidate.replace(/\bAi\b/g, "AI").replace(/\bSaas\b/g, "SaaS");
		}
	}

	return "";
}

function extractSuggestedOneLiner(source: string): string {
	const normalized = normalizeText(source);
	if (!normalized) {
		return "";
	}

	const candidate =
		normalized
			.replace(/^here'?s my read:\s*/i, "")
			.replace(/^my read:\s*/i, "")
			.match(/(?:idea could be|could be|build)\s+(.+?)(?:\.\s|$)/i)?.[1] ?? "";

	return normalizeText(candidate)
		.replace(/\s*,?\s*let'?s call it\s+[“"][^"”]+[”"]/i, "")
		.replace(/\s*,?\s*called\s+[“"][^"”]+[”"]/i, "");
}

function formatIdeaWord(word: string): string {
	if (!word) {
		return "";
	}

	if (/^[A-Z0-9-]{2,5}$/.test(word)) {
		return word;
	}

	return word
		.split("-")
		.map((part) =>
			part.length <= 3 && /^[a-z]+$/i.test(part) && part === part.toUpperCase()
				? part
				: part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
		)
		.join("-");
}

function normalizeIdeaPhrase(source: string): string {
	return source
		.replace(/https?:\/\/[^\s)]+/gi, " ")
		.replace(/[“”"'`]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function toIdeaName(source: string): string {
	let cleaned = normalizeIdeaPhrase(source)
		.replace(/^i want to (?:build|make|create|launch)\s+/i, "")
		.replace(/^i'm building\s+/i, "")
		.replace(/^im building\s+/i, "")
		.replace(
			/^(help me (?:design|build|create)|build|create|design|make|launch|turn)\s+/i,
			"",
		)
		.replace(/^(an?|the)\s+/i, "")
		.replace(/[^\w\s-]/g, " ");

	const nextButWithMatch = cleaned.match(/\bnext\s+[\w-]+\s+but\s+with\s+(.+)$/i);
	if (nextButWithMatch?.[1]) {
		cleaned = nextButWithMatch[1];
	}

	const keywordNames: Array<[RegExp, string]> = [
		[/\b(meditation|meditations|mindfulness|sleep)\b/i, "AI Meditation Coach"],
		[/\b(study|lecture|quiz|revision)\b/i, "Study Copilot"],
		[/\b(support|ticket|helpdesk)\b/i, "Support Copilot"],
		[/\b(docs|documentation|knowledge base)\b/i, "Docs Copilot"],
		[/\b(sales|lead|prospect|outreach)\b/i, "Sales Copilot"],
	];

	for (const [pattern, label] of keywordNames) {
		if (pattern.test(cleaned)) {
			return label;
		}
	}

	cleaned = cleaned.split(/\b(?:that|which|who)\b/i)[0] ?? cleaned;

	const forSplit = cleaned.split(/\bfor\b/i);
	if (forSplit.length > 1) {
		const leading = normalizeIdeaPhrase(forSplit[0] ?? "");
		const trailing = normalizeIdeaPhrase(forSplit.slice(1).join(" "));
		const leadingWords = leading.split(/\s+/).filter(Boolean);
		const trailingWords = trailing.split(/\s+/).filter(Boolean);

		if (
			leadingWords.length >= 2 &&
			trailingWords.length >= 2 &&
			!["teams", "businesses", "developers", "founders"].includes(
				trailingWords[trailingWords.length - 1]?.toLowerCase() ?? "",
			)
		) {
			cleaned = leading;
		}
	}

	const cleanedWords = cleaned
		.split(/\s+/)
		.filter(Boolean)
		.filter(
			(word) =>
				![
					"i",
					"want",
					"to",
					"next",
					"but",
					"with",
					"into",
					"from",
					"helps",
					"turns",
					"tool",
					"app",
					"platform",
				].includes(word.toLowerCase()),
		)
		.slice(0, 5);

	if (cleanedWords.length === 0) {
		return "New Product Idea";
	}

	const cleanedTitle = cleanedWords
		.map((word) => formatIdeaWord(word))
		.join(" ")
		.replace(/\bAi\b/g, "AI")
		.replace(/\bSaas\b/g, "SaaS");

	return cleanedTitle || "New Product Idea";
}

function firstSentence(source: string): string {
	const sentence = source.split(/(?<=[.!?])\s+/)[0] ?? source;
	return normalizeText(sentence);
}

function takePhrases(source: string): string[] {
	return normalizeList(
		source
			.split(/[.;,\n]|(?:\band\b)|(?:\bwith\b)/i)
			.map((part) => normalizeText(part))
			.filter((part) => part.length > 8),
	).slice(0, 4);
}

export function deriveSnapshotFromConversation(
	state: ProjectState,
): SnapshotExtraction {
	const userSignals = collectUserSignals(state.messages);
	const assistantSignals = collectAssistantSignals(state.messages);
	const latestUserSignal =
		userSignals.length > 0 ? userSignals[userSignals.length - 1] : "";
	const latestAssistantSignal =
		assistantSignals.length > 0 ? assistantSignals[assistantSignals.length - 1] : "";
	const combinedSignals = userSignals.join(". ");
	const earliestSignal = userSignals[0] ?? "";
	const genericIdeaRequest = isGenericIdeaRequest(earliestSignal || latestUserSignal);
	const suggestedIdeaName = extractSuggestedIdeaName(latestAssistantSignal);
	const suggestedOneLiner = extractSuggestedOneLiner(latestAssistantSignal);

	const fallbackFeatures = takePhrases(combinedSignals);
	const fallbackRisks = [
		"Need to validate real demand with early users.",
		"Scope can grow too quickly without a tight MVP.",
	].slice(0, combinedSignals ? 2 : 0);
	const fallbackQuestions = [
		"What is the smallest lovable workflow to ship first?",
		"Which user segment should be the first design partner?",
	].slice(0, combinedSignals ? 2 : 0);

	return {
		ideaName:
			state.ideaName ||
			(genericIdeaRequest
				? suggestedIdeaName || ""
				: toIdeaName(firstSentence(earliestSignal || latestUserSignal || "Product Idea"))),
		oneLiner:
			state.oneLiner ||
			(genericIdeaRequest
				? suggestedOneLiner || ""
				: firstSentence(earliestSignal || latestUserSignal)),
		targetUser:
			state.targetUser || "",
		problem:
			state.problem ||
			(genericIdeaRequest
				? ""
				: latestUserSignal
				? firstSentence(latestUserSignal)
				: ""),
		solution:
			state.solution ||
			(genericIdeaRequest ? suggestedOneLiner : ""),
		keyFeatures: state.keyFeatures.length > 0 ? state.keyFeatures : fallbackFeatures,
		mvpScope:
			state.mvpScope.length > 0
				? state.mvpScope
				: fallbackFeatures.slice(0, 3),
		risks: state.risks.length > 0 ? state.risks : fallbackRisks,
		openQuestions:
			state.openQuestions.length > 0 ? state.openQuestions : fallbackQuestions,
	};
}

export function failWorkflow(
	state: ProjectState,
	workflowId: string,
	sourceRevision: number,
	message: string,
): ProjectState {
	if (
		state.workflowStatus.workflowId !== workflowId ||
		state.workflowStatus.sourceRevision !== sourceRevision
	) {
		return state;
	}

	return {
		...state,
		researchStatus: createResearchStatus({
			stage: "errored",
			totalCompetitors: state.competitorUrls.length,
			completedCompetitors: state.competitorResearch.filter(
				(profile) => profile.status === "complete",
			).length,
			failedCompetitors: state.competitorResearch.filter(
				(profile) => profile.status === "failed",
			).length,
			updatedAt: nowIso(),
		}),
		researchErrors: normalizeList([
			...state.researchErrors,
			normalizeText(message) || "The launch brief workflow failed.",
		]),
		workflowStatus: createWorkflowStatus({
			status: "errored",
			workflowId,
			sourceRevision,
			error: normalizeText(message) || "The launch brief workflow failed.",
			updatedAt: nowIso(),
		}),
	};
}

export function isNonEmptyMessage(message: ChatMessage): boolean {
	return normalizeText(message.content).length > 0;
}

export function trimConversation(messages: ChatMessage[], limit = 14): ChatMessage[] {
	const nonEmptyMessages = messages.filter(isNonEmptyMessage);
	if (nonEmptyMessages.length <= limit) {
		return nonEmptyMessages;
	}

	return nonEmptyMessages.slice(-limit);
}
