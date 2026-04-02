import { describe, expect, it } from "vitest";
import {
	extractUrlsFromText,
	stripUrlsFromText,
	suggestCompetitorUrlsFromIdea,
} from "../src/research";

describe("research helpers", () => {
	it("extracts and strips urls from mixed idea text", () => {
		const source =
			"Build a calmer Headspace alternative with AI generated meditations. https://www.headspace.com/subscriptions";

		expect(extractUrlsFromText(source)).toEqual(["https://headspace.com/subscriptions"]);
		expect(stripUrlsFromText(source)).toBe(
			"Build a calmer Headspace alternative with AI generated meditations.",
		);
	});

	it("suggests likely competitors from the idea text", () => {
		expect(
			suggestCompetitorUrlsFromIdea(
				"Build an AI meditation app for burned-out professionals.",
			),
		).toEqual(["https://headspace.com", "https://calm.com"]);
	});
});
