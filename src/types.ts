export interface Env {
	AI: Ai;
	ASSETS: Fetcher;
	LAUNCH_SESSIONS: DurableObjectNamespace;
	LAUNCH_BRIEF_WORKFLOW: Workflow<LaunchWorkflowParams>;
}

export interface ChatMessage {
	role: "user" | "assistant";
	content: string;
}

export interface LaunchBrief {
	summary: string;
	audience: string;
	valueProposition: string;
	launchStrategy: string;
	successMetric: string;
}

export interface CompetitorProfile {
	url: string;
	hostname: string;
	brandName: string;
	title: string;
	summary: string;
	positioning: string;
	targetAudience: string;
	pricingHints: string[];
	keyFeatures: string[];
	cta: string;
	status: "complete" | "failed";
	error?: string;
}

export interface MarketInsight {
	title: string;
	description: string;
}

export interface DifferentiationStrategy {
	headline: string;
	whyItWins: string;
	messagingPillars: string[];
}

export interface DecisionBoard {
	buildNow: string[];
	avoidNow: string[];
	proofPoints: string[];
	firstSalesMotion: string;
}

export interface MessagingKit {
	homepageHeadline: string;
	homepageSubheadline: string;
	elevatorPitch: string;
	demoOpener: string;
}

export interface CloudflareServiceRecommendation {
	service: string;
	why: string;
}

export interface CloudflarePlan {
	summary: string;
	architecture: string;
	services: CloudflareServiceRecommendation[];
	launchSequence: string[];
	edgeAdvantage: string;
}

export interface ImplementationKit {
	productSpec: string;
	codingPrompt: string;
	agentPrompt: string;
	starterTasks: string[];
}

export interface PitchDeckSlide {
	title: string;
	headline: string;
	bullets: string[];
}

export interface ForecastPoint {
	label: string;
	value: number;
}

export interface WebsitePrototype {
	title: string;
	summary: string;
	html: string;
}

export interface WorkflowStatus {
	status: "idle" | "running" | "complete" | "errored";
	workflowId: string | null;
	sourceRevision: number | null;
	error: string | null;
	updatedAt: string | null;
}

export interface ResearchStatus {
	stage:
		| "idle"
		| "queued"
		| "researching"
		| "synthesizing"
		| "complete"
		| "errored";
	totalCompetitors: number;
	completedCompetitors: number;
	failedCompetitors: number;
	updatedAt: string | null;
}

export interface ProjectState {
	revision: number;
	messages: ChatMessage[];
	ideaName: string;
	oneLiner: string;
	targetUser: string;
	problem: string;
	solution: string;
	keyFeatures: string[];
	mvpScope: string[];
	risks: string[];
	openQuestions: string[];
	competitorUrls: string[];
	competitorResearch: CompetitorProfile[];
	marketInsights: MarketInsight[];
	recommendedWedge: string;
	differentiation: DifferentiationStrategy | null;
	researchStatus: ResearchStatus;
	researchErrors: string[];
	workflowStatus: WorkflowStatus;
	launchBrief: LaunchBrief | null;
	checklist: string[];
	validationPlan: string[];
	customerQuestions: string[];
	outreachMessage: string;
	decisionBoard: DecisionBoard | null;
	messagingKit: MessagingKit | null;
	cloudflarePlan: CloudflarePlan | null;
	implementationKit: ImplementationKit | null;
	pitchDeck: PitchDeckSlide[];
	forecast: ForecastPoint[];
	websitePrototype: WebsitePrototype | null;
}

export interface SnapshotExtraction {
	ideaName: string;
	oneLiner: string;
	targetUser: string;
	problem: string;
	solution: string;
	keyFeatures: string[];
	mvpScope: string[];
	risks: string[];
	openQuestions: string[];
}

export interface LaunchArtifacts {
	competitorResearch: CompetitorProfile[];
	marketInsights: MarketInsight[];
	recommendedWedge: string;
	differentiation: DifferentiationStrategy;
	researchErrors: string[];
	launchBrief: LaunchBrief;
	checklist: string[];
	validationPlan: string[];
	customerQuestions: string[];
	outreachMessage: string;
	decisionBoard: DecisionBoard;
	messagingKit: MessagingKit;
	cloudflarePlan: CloudflarePlan;
	implementationKit: ImplementationKit;
	pitchDeck: PitchDeckSlide[];
	forecast: ForecastPoint[];
	websitePrototype: WebsitePrototype;
}

export interface CompetitorResearchResult {
	profiles: CompetitorProfile[];
	errors: string[];
}

export interface LaunchWorkflowParams {
	sessionId: string;
	workflowId: string;
	sourceRevision: number;
	projectState: ProjectState;
}

export interface JsonModeResponse<T> {
	response: T;
}
