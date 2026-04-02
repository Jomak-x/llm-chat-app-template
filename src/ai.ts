import {
	CloudflarePlan,
	CompetitorProfile,
	CompetitorResearchResult,
	DecisionBoard,
	DifferentiationStrategy,
	ForecastPoint,
	ImplementationKit,
	LaunchArtifacts,
	LaunchBrief,
	MarketInsight,
	MessagingKit,
	PitchDeckSlide,
	ProjectState,
	WebsitePrototype,
} from "./types";
import { trimConversation } from "./state";

export const CHAT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const CHAT_SYSTEM_PROMPT = `
You are LaunchLens, an AI app auditor and Cloudflare solutions copilot inside a Cloudflare demo app.

Your job:
- help the user sharpen an AI app idea into a differentiated launch angle
- explain how the product should be built well on Cloudflare
- generate practical implementation guidance that another engineer or coding agent could use
- be practical, warm, and decisive
- ask fewer questions; make smart assumptions when you can
- when competitor research exists, use it directly instead of speaking in abstractions
- separate evidence from assumptions when it matters

Response style:
- concise and conversational
- prefer 2 to 4 bullets or short sections
- use phrases like "here's my read", "here's the wedge", or "here's the Cloudflare fit"
- end with the single most useful next move
- avoid interview-style chains of questions unless one question unlocks the next decision
- do not just mirror the user's wording back; sharpen it
- when the idea name is weak, suggest a stronger product name in the reply
`.trim();

interface LaunchPlanPayload {
	marketInsights: MarketInsight[];
	recommendedWedge: string;
	differentiation: DifferentiationStrategy;
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
}

interface AiJsonEnvelope {
	response?: string;
}

function normalizeText(value: string | null | undefined): string {
	return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeList(values: string[] | null | undefined): string[] {
	const seen = new Set<string>();
	const output: string[] = [];

	for (const value of values ?? []) {
		const normalized = normalizeText(value);
		if (!normalized) {
			continue;
		}

		const key = normalized.toLowerCase();
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		output.push(normalized);
	}

	return output;
}

function fallback<T>(value: T | null | undefined, nextValue: T): T {
	return value ?? nextValue;
}

function stringifyJson(value: unknown): string {
	return JSON.stringify(value, null, 2);
}

function slugToTitle(source: string): string {
	return source
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 5)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function renderList(items: string[]): string {
	return items
		.filter(Boolean)
		.slice(0, 4)
		.map((item) => `<li>${escapeHtml(item)}</li>`)
		.join("");
}

function buildContextMessage(state: ProjectState): string {
	const evidence = state.competitorResearch
		.filter((profile) => profile.status === "complete")
		.slice(0, 3)
		.map(
			(profile) =>
				`- ${profile.brandName || profile.hostname}: ${profile.positioning || profile.summary}`,
		)
		.join("\n");

	const insights = state.marketInsights
		.slice(0, 3)
		.map((insight) => `- ${insight.title}: ${insight.description}`)
		.join("\n");

	return `
Current memory:
- idea: ${state.ideaName || "Not named yet"}
- one-liner: ${state.oneLiner || "Still forming"}
- target user: ${state.targetUser || "Still forming"}
- problem: ${state.problem || "Still forming"}
- recommended wedge: ${state.recommendedWedge || "No wedge recommendation yet"}
- competitor urls: ${state.competitorUrls.length > 0 ? state.competitorUrls.join(", ") : "none added"}

Competitor evidence:
${evidence || "- none yet"}

Market insights:
${insights || "- none yet"}
`.trim();
}

export function buildChatMessages(state: ProjectState) {
	return [
		{ role: "system" as const, content: CHAT_SYSTEM_PROMPT },
		{ role: "system" as const, content: buildContextMessage(state) },
		...trimConversation(state.messages).map((message) => ({
			role: message.role,
			content: message.content,
		})),
	];
}

function buildConceptPreview(
	state: ProjectState,
	launchBrief: LaunchBrief,
	differentiation: DifferentiationStrategy,
	profiles: CompetitorProfile[],
): WebsitePrototype {
	const title = state.ideaName || slugToTitle(state.oneLiner || "LaunchLens Launch Page");
	const audience =
		state.targetUser || launchBrief.audience || "A focused early-adopter segment";
	const primaryColor = "#cf5b2d";
	const accentColor = "#1f7a74";
	const secondaryAccent = "#0f172a";
	const standoutCards = [
		differentiation.headline,
		differentiation.whyItWins,
		launchBrief.launchStrategy,
	].filter(Boolean);
	const features = state.keyFeatures.length > 0
		? state.keyFeatures
		: ["Focused onboarding", "Differentiated workflow", "Clear value moment"];
	const firstSteps = state.mvpScope.length > 0
		? state.mvpScope
		: ["A narrow onboarding flow", "One high-value core workflow", "A fast activation moment"];
	const proofPoints = [
		launchBrief.successMetric,
		...(state.validationPlan.slice(0, 2) ?? []),
	].filter(Boolean);
	const scenarioCards = [
		{
			label: "Discover",
			title: `Land on ${title}`,
			copy:
				differentiation.headline ||
				launchBrief.summary ||
				"Understand the focused promise immediately.",
		},
		{
			label: "Try",
			title: "Complete the first workflow",
			copy:
				firstSteps[0] ||
				"Experience one narrow workflow that proves the value quickly.",
		},
		{
			label: "Decide",
			title: "See why this wins",
			copy:
				differentiation.whyItWins ||
				launchBrief.launchStrategy ||
				"Understand the positioning and next step clearly.",
		},
	];
	const researchSummary = profiles
		.filter((profile) => profile.status === "complete")
		.slice(0, 3)
		.map((profile) => `${profile.brandName || profile.hostname}: ${profile.positioning}`)
		.filter(Boolean);

	const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { --ink:#11263f; --muted:#617285; --paper:rgba(255,249,242,.94); --line:rgba(17,38,63,.1); --accent:${primaryColor}; --accent2:${accentColor}; --accent3:${secondaryAccent}; }
    * { box-sizing: border-box; }
    body { margin:0; font-family:"Avenir Next", Arial, sans-serif; color:var(--ink); background:
      radial-gradient(circle at top left, rgba(207,91,45,.14), transparent 28%),
      radial-gradient(circle at top right, rgba(31,122,116,.12), transparent 24%),
      linear-gradient(180deg, #fff9f2, #f4e9da 68%, #e8d6c2); }
    .page { max-width: 1160px; margin: 0 auto; padding: 28px 18px 54px; }
    .hero, .panel, .toolbar { background: var(--paper); border:1px solid var(--line); border-radius:28px; box-shadow:0 22px 54px rgba(17,38,63,.08); }
    .toolbar { margin-bottom:16px; padding:14px 18px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .brand { display:flex; align-items:center; gap:10px; font-weight:700; }
    .brand-mark { width:12px; height:12px; border-radius:999px; background:linear-gradient(135deg,var(--accent),var(--accent2)); }
    .toolbar-pills { display:flex; flex-wrap:wrap; gap:8px; }
    .toolbar-pill { padding:8px 12px; border-radius:999px; background:#fff; border:1px solid rgba(17,38,63,.08); color:var(--muted); font-size:13px; }
    .hero { padding:28px; display:grid; grid-template-columns:1.1fr .9fr; gap:18px; }
    .kicker { display:inline-block; padding:8px 12px; border-radius:999px; background:rgba(207,91,45,.12); color:var(--accent); font-size:12px; letter-spacing:.08em; text-transform:uppercase; }
    h1,h2,h3 { font-family:"Iowan Old Style", Georgia, serif; margin:0; }
    h1 { margin-top:14px; max-width:8ch; font-size:clamp(2.5rem, 4vw, 4.3rem); line-height:.94; }
    p { color:var(--muted); line-height:1.6; }
    .subcopy { margin-top:12px; max-width:34rem; }
    .cta-row { display:flex; flex-wrap:wrap; gap:12px; margin-top:16px; }
    .cta { display:inline-block; padding:12px 18px; border-radius:999px; background:linear-gradient(135deg, var(--accent), #e4874c); color:#fff; text-decoration:none; font-weight:600; }
    .cta.secondary { background:#fff; color:var(--accent3); border:1px solid rgba(17,38,63,.08); }
    .pills { display:flex; flex-wrap:wrap; gap:10px; margin-top:14px; }
    .pill { padding:8px 12px; border-radius:999px; background:rgba(31,122,116,.12); color:var(--accent2); font-size:14px; }
    .grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:18px; margin-top:18px; }
    .panel { padding:20px; }
    .stack { display:grid; gap:12px; }
    .mini { border-radius:18px; background:#fff; border:1px solid rgba(17,38,63,.08); padding:16px; }
    .stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-top:18px; }
    .stat { border-radius:20px; background:#fff; border:1px solid rgba(17,38,63,.08); padding:16px; }
    .stat-label { font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
    .stat-value { margin-top:8px; font-size:24px; font-family:"Iowan Old Style", Georgia, serif; color:var(--ink); }
    .cards3 { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; margin-top:18px; }
    .card { border-radius:22px; background:#fff; border:1px solid rgba(17,38,63,.08); padding:18px; }
    .card h3 { font-size:24px; }
    .card p, .card li { font-size:14px; }
    .workspace { margin-top:18px; padding:20px; }
    .workspace-header { display:flex; flex-wrap:wrap; align-items:flex-end; justify-content:space-between; gap:12px; }
    .tab-row { display:flex; flex-wrap:wrap; gap:10px; margin-top:16px; }
    .tab { border:1px solid rgba(17,38,63,.08); background:#fff; color:var(--muted); border-radius:999px; padding:10px 14px; font-weight:600; cursor:pointer; }
    .tab.active { background:linear-gradient(135deg,var(--accent),#e4874c); color:#fff; border-color:transparent; }
    .view { display:none; margin-top:18px; }
    .view.active { display:block; }
    .split { display:grid; grid-template-columns:1.05fr .95fr; gap:16px; }
    .surface { border-radius:24px; border:1px solid rgba(17,38,63,.08); background:#fff; padding:18px; }
    .feature-list { display:grid; gap:12px; margin-top:14px; }
    .feature-item { border-radius:18px; border:1px solid rgba(17,38,63,.08); padding:14px; }
    .badge { display:inline-flex; padding:6px 10px; border-radius:999px; background:rgba(31,122,116,.12); color:var(--accent2); font-size:12px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; }
    .steps { display:grid; gap:12px; margin-top:14px; }
    .step { border-radius:18px; border:1px solid rgba(17,38,63,.08); background:#fff; padding:16px; opacity:.58; transition:opacity .18s ease, transform .18s ease, border-color .18s ease; }
    .step.active { opacity:1; transform:translateY(-2px); border-color:rgba(207,91,45,.35); }
    .step-label { font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--accent); font-weight:700; }
    .step-title { margin-top:8px; font-family:"Iowan Old Style", Georgia, serif; font-size:26px; }
    .step-controls { display:flex; flex-wrap:wrap; gap:10px; margin-top:14px; }
    .ghost { border:1px solid rgba(17,38,63,.08); background:#fff; color:var(--ink); border-radius:999px; padding:10px 14px; font-weight:600; cursor:pointer; }
    .slider-wrap { margin-top:16px; }
    .slider-wrap input { width:100%; accent-color:var(--accent); }
    .estimate { margin-top:14px; border-radius:18px; background:rgba(31,122,116,.08); padding:16px; }
    .estimate strong { display:block; font-family:"Iowan Old Style", Georgia, serif; font-size:30px; margin-top:6px; }
    .stacked { display:grid; gap:14px; }
    ul { margin:10px 0 0; padding-left:18px; color:var(--muted); }
    @media (max-width: 860px) { .hero, .grid, .cards3, .stats, .split { grid-template-columns:1fr; } .toolbar { align-items:flex-start; flex-direction:column; } }
  </style>
</head>
<body>
  <div class="page">
    <section class="toolbar">
      <div class="brand">
        <span class="brand-mark"></span>
        <span>${escapeHtml(title)} launch page</span>
      </div>
      <div class="toolbar-pills">
        <span class="toolbar-pill">${escapeHtml(audience)}</span>
        <span class="toolbar-pill">Competitor-backed positioning</span>
      </div>
    </section>
    <section class="hero">
      <div>
        <span class="kicker">Concept page</span>
        <h1>${escapeHtml(title)}</h1>
        <p class="subcopy">${escapeHtml(differentiation.headline || launchBrief.summary)}</p>
        <div class="cta-row">
          <a class="cta" href="#wedge">See the wedge</a>
          <a class="cta secondary" href="#launch-plan">See launch plan</a>
        </div>
        <div class="pills">
          <span class="pill">${escapeHtml(audience)}</span>
          <span class="pill">${escapeHtml(launchBrief.successMetric || "Early traction metric")}</span>
        </div>
        <div class="stats">
          <div class="stat">
            <div class="stat-label">Primary audience</div>
            <div class="stat-value">${escapeHtml(audience)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Core wedge</div>
            <div class="stat-value">${escapeHtml((state.mvpScope[0] || "Focused workflow").slice(0, 28))}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Success metric</div>
            <div class="stat-value">${escapeHtml((launchBrief.successMetric || "Activation").slice(0, 28))}</div>
          </div>
        </div>
      </div>
      <div class="stack" id="wedge">
        ${standoutCards
					.slice(0, 3)
					.map(
						(item, index) => `<div class="mini"><strong>${index === 0 ? "Positioning" : index === 1 ? "Why it wins" : "Launch angle"}</strong><p>${escapeHtml(item)}</p></div>`,
					)
					.join("")}
      </div>
    </section>
    <section class="cards3">
      <article class="card">
        <h3>Why this exists</h3>
        <p>${escapeHtml(launchBrief.valueProposition)}</p>
      </article>
      <article class="card">
        <h3>Why teams switch</h3>
        <p>${escapeHtml(differentiation.whyItWins)}</p>
      </article>
      <article class="card">
        <h3>What v1 proves</h3>
        <ul>${renderList(proofPoints.length > 0 ? proofPoints : ["The first workflow is clear", "Users convert quickly", "The wedge feels more specific than broader tools"])}</ul>
      </article>
    </section>
    <section class="grid">
      <article class="panel">
        <h2>What the first version does</h2>
        <ul>${renderList(features)}</ul>
      </article>
      <article class="panel">
        <h2>Market read</h2>
        <ul>${renderList(researchSummary.length > 0 ? researchSummary : [launchBrief.valueProposition, differentiation.whyItWins])}</ul>
      </article>
    </section>
    <section class="grid" id="launch-plan">
      <article class="panel">
        <h2>How the launch page should convert</h2>
        <ul>${renderList(firstSteps)}</ul>
      </article>
      <article class="panel">
        <h2>Launch plan snapshot</h2>
        <ul>${renderList([
					launchBrief.launchStrategy,
					...(state.validationPlan.slice(0, 2) ?? []),
				].filter(Boolean))}</ul>
      </article>
    </section>
    <section class="panel workspace">
      <div class="workspace-header">
        <div>
          <span class="kicker">Interactive launch page</span>
          <h2 style="margin-top:10px">Explore the pitch, user flow, and Cloudflare fit</h2>
          <p class="subcopy">This is still not the full product, but it is a usable interactive launch page: you can inspect the value proposition, click through the first user flow, and pressure-test the Cloudflare recommendation.</p>
        </div>
      </div>
      <div class="tab-row">
        <button class="tab active" data-tab="overview">Overview</button>
        <button class="tab" data-tab="flow">User Flow</button>
        <button class="tab" data-tab="cloudflare">Cloudflare Fit</button>
      </div>
      <div class="view active" data-view="overview">
        <div class="split">
          <div class="surface">
            <span class="badge">Promise</span>
            <h3 style="margin-top:12px">${escapeHtml(differentiation.headline || launchBrief.summary)}</h3>
            <p class="subcopy">${escapeHtml(launchBrief.valueProposition)}</p>
            <div class="feature-list">
              ${features
								.slice(0, 3)
								.map(
									(item, index) => `<div class="feature-item"><strong>${index + 1}. ${escapeHtml(item)}</strong><p>${escapeHtml(firstSteps[index] || "Use this to prove the first version quickly.")}</p></div>`,
								)
								.join("")}
            </div>
          </div>
          <div class="stacked">
            <div class="surface">
              <span class="badge">First win</span>
              <p class="subcopy">${escapeHtml(differentiation.whyItWins)}</p>
            </div>
            <div class="surface">
              <span class="badge">Success signal</span>
              <p class="subcopy">${escapeHtml(launchBrief.successMetric)}</p>
            </div>
          </div>
        </div>
      </div>
      <div class="view" data-view="flow">
        <div class="split">
          <div class="surface">
            <span class="badge">First user journey</span>
            <div class="steps" id="journey">
              ${scenarioCards
								.map(
									(card, index) => `<div class="step ${index === 0 ? "active" : ""}" data-step="${index}">
                  <div class="step-label">${escapeHtml(card.label)}</div>
                  <div class="step-title">${escapeHtml(card.title)}</div>
                  <p>${escapeHtml(card.copy)}</p>
                </div>`,
								)
								.join("")}
            </div>
            <div class="step-controls">
              <button class="ghost" id="prev-step" type="button">Previous</button>
              <button class="cta" id="next-step" type="button">Next step</button>
            </div>
          </div>
          <div class="surface">
            <span class="badge">Quick payoff calculator</span>
            <p class="subcopy">Use this rough slider to imagine how much leverage the first focused workflow needs to create.</p>
            <div class="slider-wrap">
              <label for="teamsize">Pilot team size</label>
              <input id="teamsize" type="range" min="3" max="40" value="12" />
            </div>
            <div class="estimate">
              <div class="stat-label">Estimated weekly workflow wins</div>
              <strong id="estimate-output">24</strong>
              <p>Assumes the first focused workflow lands twice per user each week.</p>
            </div>
          </div>
        </div>
      </div>
      <div class="view" data-view="cloudflare">
        <div class="split">
          <div class="surface">
            <span class="badge">Why Cloudflare</span>
            <h3 style="margin-top:12px">${escapeHtml(launchBrief.launchStrategy)}</h3>
            <ul>${renderList([
							"Keep the first user interaction fast at the edge.",
							"Persist session context so the product feels stateful immediately.",
							"Move heavier synthesis into background workflow steps.",
						])}</ul>
          </div>
          <div class="surface">
            <span class="badge">What to review</span>
            <ul>${renderList(proofPoints.length > 0 ? proofPoints : ["The wedge is clearer than broader competitors.", "The first workflow converts quickly.", "The Cloudflare recommendation feels proportionate to the product."])}</ul>
          </div>
        </div>
      </div>
    </section>
  </div>
  <script>
    const tabs = [...document.querySelectorAll('[data-tab]')];
    const views = [...document.querySelectorAll('[data-view]')];
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const key = tab.getAttribute('data-tab');
        tabs.forEach((item) => item.classList.toggle('active', item === tab));
        views.forEach((view) => view.classList.toggle('active', view.getAttribute('data-view') === key));
      });
    });

    const steps = [...document.querySelectorAll('.step')];
    let activeStep = 0;
    function renderStep() {
      steps.forEach((step, index) => step.classList.toggle('active', index === activeStep));
    }
    document.getElementById('next-step')?.addEventListener('click', () => {
      activeStep = (activeStep + 1) % steps.length;
      renderStep();
    });
    document.getElementById('prev-step')?.addEventListener('click', () => {
      activeStep = (activeStep - 1 + steps.length) % steps.length;
      renderStep();
    });

    const slider = document.getElementById('teamsize');
    const output = document.getElementById('estimate-output');
    if (slider && output) {
      const updateEstimate = () => {
        output.textContent = String(Number(slider.value) * 2);
      };
      slider.addEventListener('input', updateEstimate);
      updateEstimate();
    }
  </script>
</body>
</html>`;

	return {
		title,
		summary:
			launchBrief.summary ||
			differentiation.headline ||
			"A lightweight interactive launch page generated from the competitor-backed strategy.",
		html,
	};
}

function getCommonFeatures(profiles: CompetitorProfile[]): string[] {
	const counts = new Map<string, number>();
	for (const profile of profiles) {
		for (const feature of profile.keyFeatures) {
			const key = feature.toLowerCase();
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
	}

	return [...counts.entries()]
		.sort((left, right) => right[1] - left[1])
		.slice(0, 4)
		.map(([feature]) => feature);
}

function collectUniquePhrases(values: string[]): string[] {
	return normalizeList(values).slice(0, 4);
}

function summarizeContext(state: ProjectState, profiles: CompetitorProfile[]): string {
	return [
		state.ideaName,
		state.oneLiner,
		state.problem,
		state.solution,
		state.targetUser,
		...profiles.flatMap((profile) => [
			profile.summary,
			profile.positioning,
			profile.targetAudience,
			...profile.keyFeatures,
		]),
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
}

function includesAny(source: string, patterns: RegExp[]): boolean {
	return patterns.some((pattern) => pattern.test(source));
}

function buildCloudflarePlan(
	state: ProjectState,
	research: CompetitorResearchResult,
	launchBrief: LaunchBrief,
	differentiation: DifferentiationStrategy,
): CloudflarePlan {
	const context = summarizeContext(state, research.profiles);
	const services: CloudflarePlan["services"] = [
		{
			service: "Workers AI",
			why: "Use Llama 3.3 for the conversational copilot, structured synthesis, and fast iteration at the edge.",
		},
		{
			service: "Durable Objects",
			why: "Keep each product-audit session stateful so the brief, evidence, and outputs stay consistent across turns.",
		},
		{
			service: "Workflows",
			why: "Run the slower market-scan and artifact-generation steps in the background without blocking chat.",
		},
	];

	if (
		includesAny(context, [
			/\bdocs?\b/,
			/\bknowledge\b/,
			/\bsearch\b/,
			/\bassistant\b/,
			/\bsupport\b/,
			/\bvideo\b/,
			/\blecture\b/,
		])
	) {
		services.push({
			service: "Vectorize",
			why: "Store embeddings for docs, competitor notes, or user context so retrieval stays relevant as the product grows.",
		});
	}

	if (
		includesAny(context, [
			/\bsite\b/,
			/\bwebsite\b/,
			/\bbrowser\b/,
			/\bcompetitor\b/,
			/\bcrawl\b/,
			/\binspect\b/,
			/\bscreenshot\b/,
		])
	) {
		services.push({
			service: "Browser Rendering",
			why: "Capture and inspect rendered pages when the product needs website intelligence, screenshots, or agent-style browsing.",
		});
	}

	if (
		includesAny(context, [
			/\bimage\b/,
			/\bvideo\b/,
			/\baudio\b/,
			/\bfile\b/,
			/\bupload\b/,
			/\bdocument\b/,
		])
	) {
		services.push({
			service: "R2",
			why: "Store user-uploaded files and generated artifacts without pushing that workload into your transactional layer.",
		});
	}

	if (
		includesAny(context, [
			/\bingest\b/,
			/\bsync\b/,
			/\bprocess\b/,
			/\bpipeline\b/,
			/\bqueue\b/,
			/\banalysis\b/,
		])
	) {
		services.push({
			service: "Queues",
			why: "Move ingestion, summarization, or fan-out work off the user request path so the interactive experience stays fast.",
		});
	}

	if (
		includesAny(context, [
			/\bteam\b/,
			/\baccount\b/,
			/\bworkspace\b/,
			/\bcrm\b/,
			/\binventory\b/,
			/\bbooking\b/,
			/\border\b/,
		])
	) {
		services.push({
			service: "D1",
			why: "Use a relational store for durable product records like users, accounts, bookings, or structured workflow data.",
		});
	}

	services.push({
		service: "AI Gateway",
		why: "Add observability, retries, and caching around model traffic once the AI workflow moves beyond prototype mode.",
	});

	const selectedServices = services.slice(0, 6);

	return {
		summary:
			`${state.ideaName || "This idea"} looks strongest as a Cloudflare-native edge app: keep chat fast in Workers, store the session in Durable Objects, and push heavier synthesis into Workflows.`,
		architecture:
			`${launchBrief.audience || "The product"} should hit the user-facing value moment quickly, then hand off deeper synthesis and research to background steps. Pair the differentiated wedge with an edge-first request path so the experience feels immediate even when the analysis is heavier.`,
		services: selectedServices,
		launchSequence: [
			"Ship the chat or core interaction loop first with Workers AI and Durable Objects.",
			"Add the background market or product-analysis path as a Workflow once the main user action is clear.",
			"Store the smallest durable records you need for repeat usage and design-partner feedback.",
			"Only add broader infrastructure after the first wedge proves repeat value.",
		],
		edgeAdvantage:
			differentiation.whyItWins ||
			"Cloudflare lets the product keep the first interaction fast while heavier AI coordination happens off the critical path.",
	};
}

function buildImplementationKit(
	state: ProjectState,
	launchBrief: LaunchBrief,
	differentiation: DifferentiationStrategy,
	cloudflarePlan: CloudflarePlan,
): ImplementationKit {
	const appName = state.ideaName || "This product";
	const targetUser = state.targetUser || launchBrief.audience || "the first target user";
	const productSpec = [
		`${appName} is an AI product for ${targetUser.toLowerCase()}.`,
		state.oneLiner ? `Core idea: ${state.oneLiner}` : "",
		state.problem ? `Problem: ${state.problem}` : "",
		state.solution ? `Solution: ${state.solution}` : "",
		state.recommendedWedge ? `Differentiated wedge: ${state.recommendedWedge}` : "",
		launchBrief.successMetric ? `Success metric: ${launchBrief.successMetric}` : "",
	].filter(Boolean).join(" ");

	const serviceList = cloudflarePlan.services
		.map((service) => `${service.service}: ${service.why}`)
		.join(" | ");

	const codingPrompt = [
		`Build a polished MVP for ${appName} as a Cloudflare-native AI application.`,
		`Target user: ${targetUser}.`,
		state.problem ? `Problem to solve: ${state.problem}.` : "",
		state.solution ? `Product promise: ${state.solution}.` : "",
		state.recommendedWedge ? `Lead with this wedge: ${state.recommendedWedge}.` : "",
		`Use this Cloudflare architecture: ${cloudflarePlan.architecture}.`,
		serviceList ? `Recommended services: ${serviceList}.` : "",
		`Include: chat or guided input, persistent session state, background workflow orchestration, and a crisp first-run experience.`,
		`Focus on the smallest lovable workflow first, not the full platform.`,
	].filter(Boolean).join(" ");

	const agentPrompt = [
		`You are a forward-deployed engineer helping ship ${appName} on Cloudflare.`,
		`Prioritize a strong first-use experience for ${targetUser.toLowerCase()}.`,
		`Preserve the product wedge: ${differentiation.headline || state.recommendedWedge || launchBrief.valueProposition}.`,
		`Implement the user-facing request path to feel immediate, then move heavier synthesis or research into background workflows.`,
		`Use the recommended Cloudflare services only when they clearly support the core workflow.`,
	].filter(Boolean).join(" ");

	return {
		productSpec,
		codingPrompt,
		agentPrompt,
		starterTasks: [
			"Implement the smallest user-facing workflow that proves the differentiated wedge.",
			"Wire session memory so the brief, evidence, and recommendations persist across turns.",
			"Add the background analysis or synthesis workflow only after the interactive path is clear.",
			"Instrument the MVP around the first success metric before adding broader surface area.",
		],
	};
}

function buildFallbackPlan(
	state: ProjectState,
	research: CompetitorResearchResult,
): LaunchPlanPayload {
	const completeProfiles = research.profiles.filter(
		(profile) => profile.status === "complete",
	);
	const productName = state.ideaName || slugToTitle(state.oneLiner || "LaunchLens Product");
	const targetUser =
		state.targetUser ||
		completeProfiles[0]?.targetAudience ||
		"An early adopter niche identified during the strategy session";
	const problem =
		state.problem ||
		(state.oneLiner
			? `The workflow described in "${state.oneLiner}" is still too manual or fragmented.`
			: "Users still rely on slower or fragmented workflows.");
	const solution =
		state.solution ||
		state.oneLiner ||
		"An AI-assisted workflow that gives the user a faster path to the value moment.";
	const commonFeatures = getCommonFeatures(completeProfiles);
	const competitorSignals = collectUniquePhrases(
		completeProfiles.flatMap((profile) => [
			profile.positioning,
			...profile.pricingHints,
			profile.cta,
		]),
	);
	const whitespace =
		state.recommendedWedge ||
		(state.mvpScope[0]
			? `Own a narrower first release around ${state.mvpScope[0].toLowerCase()} instead of matching broader suites.`
			: "Own one narrow workflow with faster onboarding and clearer value than broader platforms.");
	const differentiation: DifferentiationStrategy = {
		headline:
			completeProfiles.length > 0
				? `${productName} should lead with a narrower promise than the current market leaders.`
				: `${productName} should lead with a focused promise and a faster time-to-value.`,
		whyItWins:
			completeProfiles.length > 0
				? `The market is clustering around ${commonFeatures.join(", ") || "broad feature bundles"}, so the strongest wedge is sharper onboarding plus a clearer first use case.`
				: "The product can win by narrowing the audience, shortening onboarding, and proving one clear workflow before expanding.",
		messagingPillars: collectUniquePhrases([
			state.oneLiner,
			state.solution,
			whitespace,
			...competitorSignals,
		]).slice(0, 3),
	};
	const decisionBoard: DecisionBoard = {
		buildNow: collectUniquePhrases([
			...(state.mvpScope.length > 0 ? state.mvpScope : ["One narrow first workflow"]),
			"Simple onboarding that proves the value in the first session",
			"Manual or semi-manual design-partner support before more automation",
		]).slice(0, 3),
		avoidNow: collectUniquePhrases([
			...(commonFeatures.length > 0
				? commonFeatures.map((feature) => `Matching the market on ${feature} immediately`)
				: ["Broad all-in-one positioning"]),
			"Deep platform breadth before the core wedge converts",
		]).slice(0, 3),
		proofPoints: collectUniquePhrases([
			"Users immediately understand the differentiated promise",
			"The first workflow gets repeat usage without heavy onboarding",
			"Design partners are willing to try the product in a live workflow",
		]).slice(0, 3),
		firstSalesMotion:
			completeProfiles.length > 0
				? `Start with founder-led outreach to users who already compare themselves against ${completeProfiles[0]?.brandName || "existing alternatives"}, then offer a fast pilot around the narrower wedge.`
				: "Start with founder-led outreach to a small niche cohort and offer a hands-on pilot around the first workflow.",
	};
	const messagingKit: MessagingKit = {
		homepageHeadline:
			completeProfiles.length > 0
				? `The ${targetUser.toLowerCase()} copilot that wins with a narrower wedge.`
				: `${productName} helps ${targetUser.toLowerCase()} get to value faster.`,
		homepageSubheadline:
			`${productName} is built around ${whitespace.toLowerCase()} so users reach a clear first win without the weight of a broader platform.`,
		elevatorPitch:
			`${productName} is a focused product for ${targetUser.toLowerCase()} that solves ${problem.toLowerCase()} with a narrower, faster-to-value workflow.`,
		demoOpener:
			`Instead of trying to replace everything at once, ${productName} starts with one wedge: ${whitespace.toLowerCase()}.`,
	};
	const marketInsights: MarketInsight[] = [
		{
			title: "Current market pattern",
			description:
				completeProfiles.length > 0
					? `Competitors consistently emphasize ${commonFeatures.join(", ") || "broad productivity features"} and generic all-in-one positioning.`
					: "No competitor research was completed, so the current strategy relies more on the user brief than external evidence.",
		},
		{
			title: "Whitespace",
			description: whitespace,
		},
		{
			title: "Messaging angle",
			description:
				`Lead with ${state.targetUser || "the first niche user"} and promise a faster first win than broader alternatives.`,
		},
	];

	const launchBrief: LaunchBrief = {
		summary: `${productName} is a competitor-informed MVP for ${targetUser.toLowerCase()} that turns "${problem.toLowerCase()}" into a more focused first-use experience.`,
		audience: targetUser,
		valueProposition: solution,
		launchStrategy:
			"Use the competitor matrix to position the product as a narrower, faster first win. Walk design partners through the launch page live before expanding scope.",
		successMetric:
			"Activation rate for the first workflow plus repeat usage during the first two weeks.",
	};
	const cloudflarePlan = buildCloudflarePlan(
		state,
		research,
		launchBrief,
		differentiation,
	);
	const implementationKit = buildImplementationKit(
		state,
		launchBrief,
		differentiation,
		cloudflarePlan,
	);

	return {
		marketInsights,
		recommendedWedge: whitespace,
		differentiation,
		launchBrief,
		checklist: [
			"Validate the wedge against 3 to 5 real users in the target niche.",
			"Ship the landing page and focused first workflow.",
			"Measure activation and repeat usage against the proposed success metric.",
			"Use live feedback to tighten the messaging against competitor claims.",
			"Prioritize the next expansion only after the first wedge converts.",
		],
		validationPlan: [
			"Run five founder-led interviews with users who already feel this pain weekly.",
			"Show the launch page and test whether the wedge is immediately clear in under 30 seconds.",
			"Offer a manual concierge pilot before building more automation.",
		],
		customerQuestions: [
			"What do you do today instead of using a tool like this?",
			"Where does the current workflow break down or slow you down the most?",
			"What result would make you try this in the next two weeks?",
		],
		outreachMessage: `Hi [Name] — I'm testing ${productName}, a focused product for ${targetUser.toLowerCase()} that helps with ${problem.toLowerCase()}. I'm looking for 15 minutes of feedback and can show a quick launch page. Interested?`,
		decisionBoard,
		messagingKit,
		cloudflarePlan,
		implementationKit,
		pitchDeck: [
			{
				title: "Market",
				headline: "The category is real, but most options are still broad or generic.",
				bullets:
					completeProfiles.length > 0
						? completeProfiles
								.slice(0, 3)
								.map(
									(profile) =>
										`${profile.brandName || profile.hostname}: ${profile.positioning || profile.summary}`,
								)
						: ["Use competitor URLs to unlock richer market evidence."],
			},
			{
				title: "Wedge",
				headline: differentiation.headline,
				bullets: [differentiation.whyItWins, ...differentiation.messagingPillars].slice(0, 3),
			},
			{
				title: "Launch",
				headline: launchBrief.launchStrategy,
				bullets: [launchBrief.successMetric, ...state.mvpScope].slice(0, 3),
			},
		],
		forecast: [
			{ label: "Week 1", value: 8 },
			{ label: "Week 2", value: 16 },
			{ label: "Week 3", value: 28 },
			{ label: "Week 4", value: 42 },
			{ label: "Week 5", value: 58 },
		],
	};
}

function parseJsonBlock<T>(value: string): T | null {
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
	const candidate = fencedMatch?.[1] ?? trimmed;
	const firstBrace = candidate.indexOf("{");
	const lastBrace = candidate.lastIndexOf("}");

	if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
		return null;
	}

	try {
		return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as T;
	} catch {
		return null;
	}
}

function normalizeMarketInsightList(
	insights: MarketInsight[] | null | undefined,
): MarketInsight[] {
	return (insights ?? [])
		.map((insight) => ({
			title: normalizeText(insight.title),
			description: normalizeText(insight.description),
		}))
		.filter((insight) => insight.title || insight.description)
		.slice(0, 4);
}

function normalizeDifferentiationOrFallback(
	differentiation: DifferentiationStrategy | null | undefined,
	fallbackDifferentiation: DifferentiationStrategy,
): DifferentiationStrategy {
	const headline = normalizeText(differentiation?.headline);
	const whyItWins = normalizeText(differentiation?.whyItWins);
	const messagingPillars = normalizeList(differentiation?.messagingPillars);

	if (!headline && !whyItWins && messagingPillars.length === 0) {
		return fallbackDifferentiation;
	}

	return {
		headline: headline || fallbackDifferentiation.headline,
		whyItWins: whyItWins || fallbackDifferentiation.whyItWins,
		messagingPillars:
			messagingPillars.length > 0
				? messagingPillars
				: fallbackDifferentiation.messagingPillars,
	};
}

async function tryAiPlan(
	env: Pick<Cloudflare.Env, "AI">,
	state: ProjectState,
	research: CompetitorResearchResult,
): Promise<LaunchPlanPayload | null> {
	const fallbackPlan = buildFallbackPlan(state, research);
	const prompt = `
You are creating a concise market strategy artifact for a Cloudflare demo app.

Return JSON only with this exact shape:
{
  "marketInsights": [{"title": string, "description": string}],
  "recommendedWedge": string,
  "differentiation": {"headline": string, "whyItWins": string, "messagingPillars": string[]},
  "launchBrief": {"summary": string, "audience": string, "valueProposition": string, "launchStrategy": string, "successMetric": string},
  "checklist": string[],
  "validationPlan": string[],
  "customerQuestions": string[],
  "outreachMessage": string,
  "decisionBoard": {"buildNow": string[], "avoidNow": string[], "proofPoints": string[], "firstSalesMotion": string},
  "messagingKit": {"homepageHeadline": string, "homepageSubheadline": string, "elevatorPitch": string, "demoOpener": string},
  "cloudflarePlan": {"summary": string, "architecture": string, "services": [{"service": string, "why": string}], "launchSequence": string[], "edgeAdvantage": string},
  "implementationKit": {"productSpec": string, "codingPrompt": string, "agentPrompt": string, "starterTasks": string[]},
  "pitchDeck": [{"title": string, "headline": string, "bullets": string[]}],
  "forecast": [{"label": string, "value": number}]
}

Be concrete, grounded, and founder-friendly. Use the competitor evidence directly when present.
The cloudflarePlan should explain the best Cloudflare-native build shape for this idea.
The implementationKit should give a strong handoff to a coding agent or engineer who will build the MVP.

Project state:
${stringifyJson({
	ideaName: state.ideaName,
	oneLiner: state.oneLiner,
	targetUser: state.targetUser,
	problem: state.problem,
	solution: state.solution,
	keyFeatures: state.keyFeatures,
	mvpScope: state.mvpScope,
	risks: state.risks,
	openQuestions: state.openQuestions,
	competitorUrls: state.competitorUrls,
})}

Competitor profiles:
${stringifyJson(research.profiles)}

Fallback reference:
${stringifyJson(fallbackPlan)}
`.trim();

	try {
		const result = (await env.AI.run(CHAT_MODEL, {
			messages: [
				{
					role: "system",
					content:
						"You generate concise structured JSON for a market strategy workflow. Return JSON only.",
				},
				{ role: "user", content: prompt },
			],
			max_tokens: 1100,
		})) as AiJsonEnvelope | string;

		const responseText =
			typeof result === "string"
				? result
				: typeof result?.response === "string"
					? result.response
					: "";
		const parsed = parseJsonBlock<LaunchPlanPayload>(responseText);
		if (!parsed) {
			return null;
		}

		return {
			marketInsights:
				normalizeMarketInsightList(parsed.marketInsights).length > 0
					? normalizeMarketInsightList(parsed.marketInsights)
					: fallbackPlan.marketInsights,
			recommendedWedge:
				normalizeText(parsed.recommendedWedge) || fallbackPlan.recommendedWedge,
			differentiation: normalizeDifferentiationOrFallback(
				parsed.differentiation,
				fallbackPlan.differentiation,
			),
			launchBrief: {
				summary:
					normalizeText(parsed.launchBrief?.summary) ||
					fallbackPlan.launchBrief.summary,
				audience:
					normalizeText(parsed.launchBrief?.audience) ||
					fallbackPlan.launchBrief.audience,
				valueProposition:
					normalizeText(parsed.launchBrief?.valueProposition) ||
					fallbackPlan.launchBrief.valueProposition,
				launchStrategy:
					normalizeText(parsed.launchBrief?.launchStrategy) ||
					fallbackPlan.launchBrief.launchStrategy,
				successMetric:
					normalizeText(parsed.launchBrief?.successMetric) ||
					fallbackPlan.launchBrief.successMetric,
			},
			checklist:
				normalizeList(parsed.checklist).length > 0
					? normalizeList(parsed.checklist).slice(0, 6)
					: fallbackPlan.checklist,
			validationPlan:
				normalizeList(parsed.validationPlan).length > 0
					? normalizeList(parsed.validationPlan).slice(0, 5)
					: fallbackPlan.validationPlan,
			customerQuestions:
				normalizeList(parsed.customerQuestions).length > 0
					? normalizeList(parsed.customerQuestions).slice(0, 5)
					: fallbackPlan.customerQuestions,
			outreachMessage:
				normalizeText(parsed.outreachMessage) || fallbackPlan.outreachMessage,
			decisionBoard: {
				buildNow:
					normalizeList(parsed.decisionBoard?.buildNow).length > 0
						? normalizeList(parsed.decisionBoard?.buildNow).slice(0, 4)
						: fallbackPlan.decisionBoard.buildNow,
				avoidNow:
					normalizeList(parsed.decisionBoard?.avoidNow).length > 0
						? normalizeList(parsed.decisionBoard?.avoidNow).slice(0, 4)
						: fallbackPlan.decisionBoard.avoidNow,
				proofPoints:
					normalizeList(parsed.decisionBoard?.proofPoints).length > 0
						? normalizeList(parsed.decisionBoard?.proofPoints).slice(0, 4)
						: fallbackPlan.decisionBoard.proofPoints,
				firstSalesMotion:
					normalizeText(parsed.decisionBoard?.firstSalesMotion) ||
					fallbackPlan.decisionBoard.firstSalesMotion,
			},
			messagingKit: {
				homepageHeadline:
					normalizeText(parsed.messagingKit?.homepageHeadline) ||
					fallbackPlan.messagingKit.homepageHeadline,
				homepageSubheadline:
					normalizeText(parsed.messagingKit?.homepageSubheadline) ||
					fallbackPlan.messagingKit.homepageSubheadline,
				elevatorPitch:
					normalizeText(parsed.messagingKit?.elevatorPitch) ||
					fallbackPlan.messagingKit.elevatorPitch,
				demoOpener:
					normalizeText(parsed.messagingKit?.demoOpener) ||
					fallbackPlan.messagingKit.demoOpener,
			},
			cloudflarePlan: {
				summary:
					normalizeText(parsed.cloudflarePlan?.summary) ||
					fallbackPlan.cloudflarePlan.summary,
				architecture:
					normalizeText(parsed.cloudflarePlan?.architecture) ||
					fallbackPlan.cloudflarePlan.architecture,
				services:
					(parsed.cloudflarePlan?.services ?? [])
						.map((service) => ({
							service: normalizeText(service.service),
							why: normalizeText(service.why),
						}))
						.filter((service) => service.service || service.why)
						.slice(0, 6).length > 0
						? (parsed.cloudflarePlan?.services ?? [])
								.map((service) => ({
									service: normalizeText(service.service),
									why: normalizeText(service.why),
								}))
								.filter((service) => service.service || service.why)
								.slice(0, 6)
						: fallbackPlan.cloudflarePlan.services,
				launchSequence:
					normalizeList(parsed.cloudflarePlan?.launchSequence).length > 0
						? normalizeList(parsed.cloudflarePlan?.launchSequence).slice(0, 6)
						: fallbackPlan.cloudflarePlan.launchSequence,
				edgeAdvantage:
					normalizeText(parsed.cloudflarePlan?.edgeAdvantage) ||
					fallbackPlan.cloudflarePlan.edgeAdvantage,
			},
			implementationKit: {
				productSpec:
					normalizeText(parsed.implementationKit?.productSpec) ||
					fallbackPlan.implementationKit.productSpec,
				codingPrompt:
					normalizeText(parsed.implementationKit?.codingPrompt) ||
					fallbackPlan.implementationKit.codingPrompt,
				agentPrompt:
					normalizeText(parsed.implementationKit?.agentPrompt) ||
					fallbackPlan.implementationKit.agentPrompt,
				starterTasks:
					normalizeList(parsed.implementationKit?.starterTasks).length > 0
						? normalizeList(parsed.implementationKit?.starterTasks).slice(0, 6)
						: fallbackPlan.implementationKit.starterTasks,
			},
			pitchDeck:
				(parsed.pitchDeck ?? []).length > 0
					? parsed.pitchDeck
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
							)
							.slice(0, 4)
					: fallbackPlan.pitchDeck,
			forecast:
				(parsed.forecast ?? []).length > 0
					? parsed.forecast
							.map((point) => ({
								label: normalizeText(point.label),
								value: Math.max(0, Math.round(Number(point.value) || 0)),
							}))
							.filter((point) => point.label.length > 0)
							.slice(0, 6)
					: fallbackPlan.forecast,
		};
	} catch (error) {
		console.warn("Falling back to deterministic market synthesis:", error);
		return null;
	}
}

export async function generateLaunchPlan(
	env: Pick<Cloudflare.Env, "AI">,
	state: ProjectState,
	research: CompetitorResearchResult,
): Promise<LaunchPlanPayload> {
	return (await tryAiPlan(env, state, research)) ?? buildFallbackPlan(state, research);
}

export async function generateLaunchArtifacts(
	env: Pick<Cloudflare.Env, "AI">,
	state: ProjectState,
	research: CompetitorResearchResult,
): Promise<LaunchArtifacts> {
	const plan = await generateLaunchPlan(env, state, research);
	const websitePrototype = buildConceptPreview(
		state,
		plan.launchBrief,
		plan.differentiation,
		research.profiles,
	);

	return {
		competitorResearch: research.profiles,
		marketInsights: plan.marketInsights,
		recommendedWedge: plan.recommendedWedge,
		differentiation: plan.differentiation,
		researchErrors: research.errors,
		launchBrief: plan.launchBrief,
		checklist: plan.checklist,
		validationPlan: plan.validationPlan,
		customerQuestions: plan.customerQuestions,
		outreachMessage: plan.outreachMessage,
		decisionBoard: plan.decisionBoard,
		messagingKit: plan.messagingKit,
		cloudflarePlan: plan.cloudflarePlan,
		implementationKit: plan.implementationKit,
		pitchDeck: plan.pitchDeck,
		forecast: plan.forecast,
		websitePrototype,
	};
}

export function createEmptyResearchResult(): CompetitorResearchResult {
	return {
		profiles: [],
		errors: [],
	};
}
