import { CompetitorProfile, CompetitorResearchResult } from "./types";

const FETCH_TIMEOUT_MS = 7000;

const COMPETITOR_CATALOG = [
	{
		keywords: ["meditation", "mindfulness", "wellness", "sleep"],
		urls: ["https://www.headspace.com", "https://www.calm.com"],
	},
	{
		keywords: ["budget", "budgeting", "receipt", "savings", "finance", "grocery"],
		urls: ["https://www.rocketmoney.com", "https://www.ynab.com"],
	},
	{
		keywords: ["hotel", "concierge", "guest", "hospitality", "front desk"],
		urls: ["https://www.canarytechnologies.com", "https://www.mews.com"],
	},
	{
		keywords: ["study", "lecture", "quiz", "student", "learning", "revision"],
		urls: ["https://quizlet.com", "https://www.notion.so"],
	},
	{
		keywords: ["project", "task", "workflow", "pm", "productivity"],
		urls: ["https://www.asana.com", "https://www.clickup.com", "https://linear.app"],
	},
	{
		keywords: ["support", "ticket", "helpdesk", "customer service"],
		urls: ["https://www.intercom.com", "https://www.zendesk.com"],
	},
	{
		keywords: ["documentation", "docs", "knowledge base"],
		urls: ["https://www.gitbook.com", "https://readme.com"],
	},
	{
		keywords: ["sales", "lead", "prospect", "outreach", "crm"],
		urls: ["https://www.hubspot.com", "https://www.pipedrive.com"],
	},
];

function normalizeText(value: string | null | undefined): string {
	return (value ?? "").replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string): string {
	return value
		.replaceAll("&amp;", "&")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&#39;", "'");
}

function stripTags(html: string): string {
	return decodeHtml(
		html
			.replace(/<script[\s\S]*?<\/script>/gi, " ")
			.replace(/<style[\s\S]*?<\/style>/gi, " ")
			.replace(/<[^>]+>/g, " "),
	)
		.replace(/\s+/g, " ")
		.trim();
}

function matchTagContent(html: string, tagName: string): string {
	const match = html.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
	return normalizeText(stripTags(match?.[1] ?? ""));
}

function matchMetaContent(html: string, metaName: string): string {
	const byName = html.match(
		new RegExp(
			`<meta[^>]+(?:name|property)=["']${metaName}["'][^>]+content=["']([^"']+)["'][^>]*>`,
			"i",
		),
	);
	const byContentFirst = html.match(
		new RegExp(
			`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${metaName}["'][^>]*>`,
			"i",
		),
	);

	return normalizeText(decodeHtml(byName?.[1] ?? byContentFirst?.[1] ?? ""));
}

function collectTagTexts(html: string, tagName: string, limit: number): string[] {
	const matcher = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
	const values: string[] = [];
	let match: RegExpExecArray | null = null;

	while ((match = matcher.exec(html)) && values.length < limit) {
		const normalized = normalizeText(stripTags(match[1] ?? ""));
		if (normalized && !values.includes(normalized)) {
			values.push(normalized);
		}
	}

	return values;
}

function collectPricingHints(text: string): string[] {
	const matches = text.match(
		/\b(?:free trial|free plan|contact sales|book a demo|\$\d+(?:\/(?:mo|month|yr|year))?)\b/gi,
	);
	const values = new Set<string>();

	for (const match of matches ?? []) {
		values.add(normalizeText(match));
	}

	return [...values].slice(0, 4);
}

function extractCta(html: string): string {
	const button = html.match(/<(?:a|button)[^>]*>([\s\S]*?)<\/(?:a|button)>/i);
	return normalizeText(stripTags(button?.[1] ?? ""));
}

function toHostname(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

function brandFromHostname(hostname: string): string {
	const firstSegment = hostname.split(".")[0] ?? hostname;
	return firstSegment
		.split(/[-_]/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function normalizeFeatureList(values: string[]): string[] {
	const seen = new Set<string>();
	const output: string[] = [];

	for (const value of values) {
		const normalized = normalizeText(value);
		if (!normalized || normalized.length < 8) {
			continue;
		}
		const key = normalized.toLowerCase();
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		output.push(normalized);
	}

	return output.slice(0, 4);
}

function buildProfileFromHtml(url: string, html: string): CompetitorProfile {
	const hostname = toHostname(url);
	const title = matchTagContent(html, "title") || brandFromHostname(hostname);
	const description =
		matchMetaContent(html, "description") ||
		matchMetaContent(html, "og:description");
	const h1 = collectTagTexts(html, "h1", 2)[0] ?? "";
	const headings = collectTagTexts(html, "h2", 6);
	const bodyText = stripTags(html).slice(0, 8000);
	const pricingHints = collectPricingHints(bodyText);
	const featureCandidates = normalizeFeatureList([h1, ...headings]);
	const summary = description || h1 || featureCandidates[0] || `Public website scan for ${hostname}.`;
	const positioning =
		h1 ||
		description ||
		`${brandFromHostname(hostname)} appears to lead with a broad product promise for its category.`;

	return {
		url,
		hostname,
		brandName: brandFromHostname(hostname),
		title,
		summary,
		positioning,
		targetAudience:
			(description.match(/\bfor\s+([^.,;]+)/i)?.[1] ?? "General business teams").trim(),
		pricingHints,
		keyFeatures: featureCandidates,
		cta: extractCta(html) || "Learn more",
		status: "complete",
	};
}

async function fetchPage(url: string): Promise<string> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

	try {
		const response = await fetch(url, {
			redirect: "follow",
			signal: controller.signal,
			headers: {
				accept: "text/html,application/xhtml+xml",
			},
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		return await response.text();
	} finally {
		clearTimeout(timeout);
	}
}

export function normalizeCompetitorUrls(urls: string[]): string[] {
	const seen = new Set<string>();
	const output: string[] = [];

	for (const value of urls) {
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

export function extractUrlsFromText(source: string): string[] {
	const matches = source.match(/https?:\/\/[^\s)]+/gi) ?? [];
	return normalizeCompetitorUrls(matches);
}

export function stripUrlsFromText(source: string): string {
	return normalizeText(source.replace(/https?:\/\/[^\s)]+/gi, " "));
}

export function suggestCompetitorUrlsFromIdea(source: string): string[] {
	const normalized = stripUrlsFromText(source).toLowerCase();
	if (!normalized) {
		return [];
	}

	const suggestions: string[] = [];

	for (const entry of COMPETITOR_CATALOG) {
		if (entry.keywords.some((keyword) => normalized.includes(keyword))) {
			suggestions.push(...entry.urls);
		}
	}

	return normalizeCompetitorUrls(suggestions).slice(0, 3);
}

export async function researchCompetitors(
	urls: string[],
): Promise<CompetitorResearchResult> {
	const normalizedUrls = normalizeCompetitorUrls(urls);
	const profiles: CompetitorProfile[] = [];
	const errors: string[] = [];

	for (const url of normalizedUrls) {
		try {
			const html = await fetchPage(url);
			profiles.push(buildProfileFromHtml(url, html));
		} catch (error) {
			const hostname = toHostname(url);
			const message =
				error instanceof Error ? error.message : "Unknown fetch failure";
			profiles.push({
				url,
				hostname,
				brandName: brandFromHostname(hostname),
				title: brandFromHostname(hostname),
				summary: `LaunchLens could not fully fetch ${hostname}, so this competitor was only partially analyzed.`,
				positioning: "",
				targetAudience: "",
				pricingHints: [],
				keyFeatures: [],
				cta: "",
				status: "failed",
				error: message,
			});
			errors.push(`Could not analyze ${hostname}: ${message}`);
		}
	}

	return { profiles, errors };
}
