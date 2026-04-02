import { describe, expect, it } from "vitest";
import {
	appendAssistantMessage,
	appendUserMessage,
	completeWorkflow,
	createDefaultState,
	deriveSnapshotFromConversation,
	failWorkflow,
	markWorkflowRunning,
	mergeSnapshot,
	resetState,
	setCompetitorUrls,
	updateResearchProgress,
} from "../src/state";

describe("project state", () => {
	it("starts with a welcome message and idle workflow state", () => {
		const state = createDefaultState();

		expect(state.messages).toHaveLength(1);
		expect(state.messages[0]?.role).toBe("assistant");
		expect(state.workflowStatus.status).toBe("idle");
		expect(state.launchBrief).toBeNull();
		expect(state.pitchDeck).toEqual([]);
		expect(state.forecast).toEqual([]);
		expect(state.websitePrototype).toBeNull();
	});

	it("stores user and assistant turns and increments revision", () => {
		const userState = appendUserMessage(createDefaultState(), "Launch an AI planner");
		const finalState = appendAssistantMessage(
			userState,
			"Let's define the audience and MVP.",
		);

		expect(userState.revision).toBe(1);
		expect(finalState.revision).toBe(2);
		expect(finalState.messages.at(-1)?.role).toBe("assistant");
	});

	it("merges structured snapshot fields without erasing useful values", () => {
		const withIdea = mergeSnapshot(createDefaultState(), {
			ideaName: "Receipt Coach",
			oneLiner: "Budget coaching from grocery receipts",
			targetUser: "Busy parents",
			problem: "Budgeting feels tedious",
			solution: "Turn receipts into weekly coaching",
			keyFeatures: ["Receipt upload", "Weekly nudges"],
			mvpScope: ["Receipt parsing", "Weekly summary"],
			risks: ["OCR accuracy"],
			openQuestions: ["How much automation is enough?"],
		});

		const merged = mergeSnapshot(withIdea, {
			ideaName: "",
			oneLiner: "",
			targetUser: "",
			problem: "",
			solution: "",
			keyFeatures: ["Weekly nudges", "Family spending categories"],
			mvpScope: ["Weekly summary"],
			risks: ["Data privacy"],
			openQuestions: [],
		});

		expect(merged.ideaName).toBe("Receipt Coach");
		expect(merged.keyFeatures).toEqual([
			"Receipt upload",
			"Weekly nudges",
			"Family spending categories",
		]);
		expect(merged.risks).toEqual(["OCR accuracy", "Data privacy"]);
	});

	it("marks a workflow as running and ignores stale completion payloads", () => {
		const initial = appendUserMessage(createDefaultState(), "Help me launch a study app");
		const running = markWorkflowRunning(initial, "wf-1");
		const staleCompletion = completeWorkflow(running, "wf-1", 999, {
			launchBrief: {
				summary: "Stale brief",
				audience: "Students",
				valueProposition: "Faster studying",
				launchStrategy: "Campus ambassadors",
				successMetric: "10 active teams",
			},
			checklist: ["Do not apply"],
			validationPlan: [],
			customerQuestions: [],
			outreachMessage: "",
			decisionBoard: {
				buildNow: [],
				avoidNow: [],
				proofPoints: [],
				firstSalesMotion: "",
			},
				messagingKit: {
					homepageHeadline: "",
					homepageSubheadline: "",
					elevatorPitch: "",
					demoOpener: "",
				},
				cloudflarePlan: {
					summary: "",
					architecture: "",
					services: [],
					launchSequence: [],
					edgeAdvantage: "",
				},
				implementationKit: {
					productSpec: "",
					codingPrompt: "",
					agentPrompt: "",
					starterTasks: [],
				},
				pitchDeck: [],
				forecast: [],
				websitePrototype: {
				title: "",
				summary: "",
				html: "",
			},
		});

		expect(staleCompletion.launchBrief).toBeNull();
		expect(staleCompletion.workflowStatus.status).toBe("running");

		const completed = completeWorkflow(
			running,
			"wf-1",
			running.workflowStatus.sourceRevision ?? -1,
			{
				launchBrief: {
					summary: "Interactive study guides for long videos.",
					audience: "College students learning from YouTube",
					valueProposition: "Turn passive video watching into guided practice.",
					launchStrategy: "Seed creator partnerships and campus study groups.",
					successMetric: "Weekly active study sessions per learner.",
				},
				checklist: ["Ship the first importer", "Recruit five test users"],
				validationPlan: ["Interview five students who study from long videos"],
				customerQuestions: ["Where do long videos lose you today?"],
				outreachMessage: "Hi — I’m testing a study guide copilot for video-heavy learners.",
				decisionBoard: {
					buildNow: ["Video importer", "Checkpoint flow"],
					avoidNow: ["Full LMS platform"],
					proofPoints: ["Students finish a study session"],
					firstSalesMotion: "Recruit students from creator-led cohorts.",
				},
				messagingKit: {
					homepageHeadline: "Turn long videos into guided study sessions.",
					homepageSubheadline: "A focused copilot for students who learn from lecture-heavy content.",
					elevatorPitch: "We turn passive lecture videos into checkpoints, quizzes, and revision plans.",
					demoOpener: "Think Quizlet for long-form video learning.",
				},
				cloudflarePlan: {
					summary: "Keep chat at the edge and background synthesis in Workflows.",
					architecture: "Workers AI plus Durable Objects for the study workflow.",
					services: [
						{ service: "Workers AI", why: "Generate chat and strategy output." },
						{ service: "Durable Objects", why: "Keep the session stateful." },
					],
					launchSequence: ["Ship the chat loop first"],
					edgeAdvantage: "Fast feedback during study sessions.",
				},
				implementationKit: {
					productSpec: "StudySprint is an AI product for college students learning from long videos.",
					codingPrompt: "Build a polished MVP for StudySprint as a Cloudflare-native AI application.",
					agentPrompt: "You are a forward-deployed engineer helping ship StudySprint on Cloudflare.",
					starterTasks: ["Implement the study loop first"],
				},
				pitchDeck: [
					{
						title: "Problem",
						headline: "Students lose context in long videos",
						bullets: ["Passive learning", "No structured checkpoints"],
					},
				],
				forecast: [
					{ label: "Week 1", value: 20 },
					{ label: "Week 2", value: 45 },
				],
				websitePrototype: {
					title: "StudySprint",
					summary: "A lightweight website prototype for interactive study guides.",
					html: "<!doctype html><html><body><h1>StudySprint</h1></body></html>",
				},
			},
		);

		expect(completed.workflowStatus.status).toBe("complete");
		expect(completed.launchBrief?.audience).toContain("College students");
		expect(completed.checklist).toHaveLength(2);
		expect(completed.cloudflarePlan?.services).toHaveLength(2);
		expect(completed.implementationKit?.starterTasks).toHaveLength(1);
		expect(completed.pitchDeck).toHaveLength(1);
		expect(completed.forecast).toHaveLength(2);
		expect(completed.websitePrototype?.title).toBe("StudySprint");
	});

	it("resets launch artifacts when the user changes the idea after a completed run", () => {
		const running = markWorkflowRunning(
			appendUserMessage(createDefaultState(), "Build a hotel concierge"),
			"wf-2",
		);
		const completed = completeWorkflow(
			running,
			"wf-2",
			running.workflowStatus.sourceRevision ?? -1,
			{
				launchBrief: {
					summary: "A staff-side guest concierge.",
					audience: "Boutique hotel teams",
					valueProposition: "Faster, more consistent guest replies.",
					launchStrategy: "Pilot with one property group.",
					successMetric: "Response time and guest satisfaction.",
				},
				checklist: ["Pilot workflow"],
				validationPlan: ["Pilot with one boutique hotel property"],
				customerQuestions: ["How often do guest questions interrupt your team?"],
				outreachMessage: "Hi — I’m testing an AI concierge workflow for boutique hotels.",
				decisionBoard: {
					buildNow: ["Guest question triage"],
					avoidNow: ["Broad hotel operations suite"],
					proofPoints: ["Staff saves time on replies"],
					firstSalesMotion: "Founder-led outreach to boutique hotel operators.",
				},
				messagingKit: {
					homepageHeadline: "Answer guest questions faster without sounding robotic.",
					homepageSubheadline: "A boutique-hotel concierge workflow for lean front desk teams.",
					elevatorPitch: "We help hotel teams handle guest questions and upsells faster with an AI concierge workflow.",
					demoOpener: "This is the fastest path to consistent guest replies for boutique properties.",
				},
				cloudflarePlan: {
					summary: "Run the concierge at the edge with Cloudflare-native state.",
					architecture: "Workers AI, Durable Objects, and Workflows cover the first version.",
					services: [
						{ service: "Workers AI", why: "Generate replies." },
						{ service: "Durable Objects", why: "Keep conversation state canonical." },
					],
					launchSequence: ["Pilot the reply workflow first"],
					edgeAdvantage: "Fast guest-facing interactions.",
				},
				implementationKit: {
					productSpec: "HotelFlow is an AI concierge for boutique hotel teams.",
					codingPrompt: "Build a polished MVP for HotelFlow as a Cloudflare-native AI application.",
					agentPrompt: "You are a forward-deployed engineer helping ship HotelFlow on Cloudflare.",
					starterTasks: ["Implement the guest reply workflow first"],
				},
				pitchDeck: [
					{
						title: "Why now",
						headline: "Hotels need faster guest response loops",
						bullets: ["Staff bandwidth is limited"],
					},
				],
				forecast: [{ label: "Week 1", value: 10 }],
				websitePrototype: {
					title: "HotelFlow",
					summary: "A boutique hotel concierge prototype.",
					html: "<!doctype html><html><body><h1>HotelFlow</h1></body></html>",
				},
			},
		);
		const edited = appendUserMessage(
			completed,
			"Actually, focus on spa upsells instead of general concierge.",
		);

		expect(edited.launchBrief).toBeNull();
		expect(edited.checklist).toEqual([]);
		expect(edited.cloudflarePlan).toBeNull();
		expect(edited.implementationKit).toBeNull();
		expect(edited.pitchDeck).toEqual([]);
		expect(edited.forecast).toEqual([]);
		expect(edited.websitePrototype).toBeNull();
		expect(edited.workflowStatus.status).toBe("idle");
	});

	it("derives a cleaner idea name from long natural-language prompts", () => {
		const state = appendUserMessage(
			createDefaultState(),
			"Design a receipt-based budgeting coach for busy families that turns grocery purchases into weekly savings recommendations.",
		);

		const snapshot = deriveSnapshotFromConversation(state);

		expect(snapshot.ideaName).toBe("Receipt-Based Budgeting Coach");
		expect(snapshot.oneLiner).toContain("receipt-based budgeting coach");
	});

	it("preserves useful acronyms in derived idea names", () => {
		const state = appendUserMessage(
			createDefaultState(),
			"Build an AI concierge for boutique hotels that helps front desk teams answer guest questions faster.",
		);

		const snapshot = deriveSnapshotFromConversation(state);

		expect(snapshot.ideaName).toBe("AI Concierge");
	});

	it("derives a cleaner name when the raw idea includes competitor phrasing and pasted urls", () => {
		const state = appendUserMessage(
			createDefaultState(),
			"I want to build the next headspace but with AI generated meditations. https://www.headspace.com/subscriptions",
		);

		const snapshot = deriveSnapshotFromConversation(state);

		expect(snapshot.ideaName).toBe("AI Meditation Coach");
	});

	it("uses the assistant-suggested concept when the user asks for a generic startup idea", () => {
		const withPrompt = appendUserMessage(
			createDefaultState(),
			"Give me a good idea that can become a unicorn",
		);
		const withAssistant = appendAssistantMessage(
			withPrompt,
			`Here's my read: A promising AI app idea could be an automated content creation platform, let's call it "ContentSphere". This platform would use AI to generate high-quality content for businesses.`,
		);

		const snapshot = deriveSnapshotFromConversation(withAssistant);

		expect(snapshot.ideaName).toBe("ContentSphere");
		expect(snapshot.oneLiner).toContain("automated content creation platform");
		expect(snapshot.targetUser).toBe("");
		expect(snapshot.problem).toBe("");
	});

	it("normalizes competitor URLs and clears stale analysis artifacts when they change", () => {
		const running = markWorkflowRunning(
			appendUserMessage(createDefaultState(), "Build a market research copilot"),
			"wf-4",
		);
		const completed = completeWorkflow(
			running,
			"wf-4",
			running.workflowStatus.sourceRevision ?? -1,
			{
				competitorResearch: [],
				marketInsights: [
					{
						title: "Whitespace",
						description: "Focus on competitor-backed product strategy.",
					},
				],
				recommendedWedge: "Own the market research layer.",
				differentiation: {
					headline: "Sharper than generic builders.",
					whyItWins: "It combines research and strategy.",
					messagingPillars: ["Research", "Strategy", "Prototype"],
				},
				researchErrors: [],
				launchBrief: {
					summary: "Summary",
					audience: "Founders",
					valueProposition: "Evidence-backed strategy",
					launchStrategy: "Design partners",
					successMetric: "Activation",
				},
				checklist: ["Ship"],
				validationPlan: ["Run five founder interviews"],
				customerQuestions: ["How do you validate product ideas today?"],
				outreachMessage: "Hi — I’m testing a research copilot for founders.",
				decisionBoard: {
					buildNow: ["Competitor URL analysis"],
					avoidNow: ["General no-code builder"],
					proofPoints: ["Founders act on the brief"],
					firstSalesMotion: "Reach out in founder communities with a live teardown offer.",
				},
				messagingKit: {
					homepageHeadline: "Research the market before you build the wrong thing.",
					homepageSubheadline: "A founder copilot that turns competitor evidence into a sharper MVP wedge.",
					elevatorPitch: "We help founders analyze competitors, find whitespace, and turn that into a better first product strategy.",
					demoOpener: "This is the tool you use before you waste a month building the wrong MVP.",
				},
				cloudflarePlan: {
					summary: "Run the chat and audit at the edge, then synthesize the heavier market read in a Workflow.",
					architecture: "Workers AI plus Durable Objects cover the first version cleanly.",
					services: [
						{ service: "Workers AI", why: "Handle the chat and synthesis." },
						{ service: "Durable Objects", why: "Keep each audit session canonical." },
					],
					launchSequence: ["Ship the audit flow first"],
					edgeAdvantage: "Fast first interaction with persistent strategy memory.",
				},
				implementationKit: {
					productSpec: "LaunchLens is an audit product for founders.",
					codingPrompt: "Build a polished MVP for LaunchLens as a Cloudflare-native AI application.",
					agentPrompt: "You are a forward-deployed engineer helping ship LaunchLens on Cloudflare.",
					starterTasks: ["Ship the audit flow first"],
				},
				pitchDeck: [],
				forecast: [],
				websitePrototype: {
					title: "LaunchLens",
					summary: "Prototype",
					html: "<!doctype html><html><body>Prototype</body></html>",
				},
			},
		);

		const updated = setCompetitorUrls(completed, [
			"notion.so",
			"https://www.notion.so/",
			"https://www.asana.com",
		]);

		expect(updated.competitorUrls).toEqual([
			"https://notion.so",
			"https://asana.com",
		]);
		expect(updated.marketInsights).toEqual([]);
		expect(updated.recommendedWedge).toBe("");
		expect(updated.websitePrototype).toBeNull();
		expect(updated.workflowStatus.status).toBe("idle");
	});

	it("tracks competitor research progress independently from the final artifact synthesis", () => {
		const withUrls = setCompetitorUrls(createDefaultState(), [
			"https://www.notion.so",
			"https://www.asana.com",
		]);
		const running = markWorkflowRunning(
			appendUserMessage(withUrls, "Build a planning copilot"),
			"wf-5",
		);
		const progressed = updateResearchProgress(running, {
			stage: "synthesizing",
			profiles: [
				{
					url: "https://www.notion.so",
					hostname: "notion.so",
					brandName: "Notion",
					title: "Notion",
					summary: "Workspace software",
					positioning: "All-in-one workspace",
					targetAudience: "Teams",
					pricingHints: ["free plan"],
					keyFeatures: ["Docs", "Projects"],
					cta: "Get started",
					status: "complete",
				},
				{
					url: "https://www.asana.com",
					hostname: "asana.com",
					brandName: "Asana",
					title: "Asana",
					summary: "Work management",
					positioning: "",
					targetAudience: "",
					pricingHints: [],
					keyFeatures: [],
					cta: "",
					status: "failed",
					error: "HTTP 403",
				},
			],
			errors: ["Could not analyze asana.com: HTTP 403"],
		});

		expect(progressed.researchStatus.stage).toBe("synthesizing");
		expect(progressed.researchStatus.completedCompetitors).toBe(1);
		expect(progressed.researchStatus.failedCompetitors).toBe(1);
		expect(progressed.researchErrors).toContain("Could not analyze asana.com: HTTP 403");
	});

	it("records matching workflow failures and supports reset", () => {
		const running = markWorkflowRunning(
			appendUserMessage(createDefaultState(), "AI grocery coach"),
			"wf-3",
		);
		const failed = failWorkflow(
			running,
			"wf-3",
			running.workflowStatus.sourceRevision ?? -1,
			"Generation timed out",
		);

		expect(failed.workflowStatus.status).toBe("errored");
		expect(failed.workflowStatus.error).toContain("timed out");
		expect(resetState()).toEqual(createDefaultState());
	});
});
