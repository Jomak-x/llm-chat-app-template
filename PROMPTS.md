# AI Prompts Used

This file documents the main prompts and instructions used while building this project with AI assistance.

## Product ideation and framing

```text
I was given this challenge for a cloudflare application... I want to build something quickly so lets first brainstorm a cool idea then we make a plan and then you implement this ok?
```

```text
I want something that would be easy to demo for the guys at cloudflare. They just clone it and instantly understand what it does and can use it.
```

```text
We need to find a cooler idea. We need to find an agent idea that is actually doing something.
```

```text
I just want something that is also outside of just the website. That it can interact with something outside of just generation to show real understanding.
```

```text
Maybe something with MCP servers or something similar. Make it really impressive, with analysis of the market and how to stand out.
```

## Planning prompts

```text
Reposition the app from an idea-to-website generator into a stateful AI founder copilot that researches real competitor websites through a public-web MCP integration, stores structured market memory, and turns that evidence into a differentiated MVP strategy plus prototype.
```

```text
Make it more conversational and less questioning. More personal. More productive actually.
```

## Implementation guidance

```text
Keep the current Cloudflare architecture: Workers AI for chat and synthesis, a Durable Object for memory, a Workflow for background coordination, and a React frontend with chat, voice, and clear reviewer-friendly UX.
```

```text
Add a dedicated competitor input area, visible research pipeline, competitor matrix, whitespace recommendation, and a generated prototype tied to the market analysis.
```

```text
Introduce a public-web research layer that fetches public competitor pages, extracts useful signals, and degrades gracefully if a page fails.
```

## Verification and polish

```text
Double check everything. See if there are areas for improvement and just verify everything. Write in the read me to show how it fits the deliverable since this is for a SWE intern position application.
```

```text
Reinforce everything works as it should. Run everything in test first and then tell me you are done.
```

```text
Update the read me to explain clearly what the use case is, what the app can do, and exactly how it satisfies the Cloudflare assignment requirements.
```

```text
Think about the current features. Think about if they are useful, how a real human would actually use them, and improve them so the app is more actionable and less like a demo.
```

```text
Reinforce improve build. Keep improving the frontend, the capabilities, and the handoff value while keeping the Cloudflare assignment requirements obvious.
```

```text
The UX still feels overengineered. Make the real use case obvious, reduce the wall of text, improve the naming, and let the AI infer competitors automatically so the app feels plug-and-play.
```

## In-app model prompts

The application itself also uses prompt instructions inside `src/ai.ts`:

- a founder-copilot system prompt for live chat
- a structured context message that injects saved brief data and competitor findings into chat
- a market-strategy synthesis prompt for workflow artifact generation

## Notes

- AI assistance was used for brainstorming, planning, implementation support, UI refinement, and verification.
- Final code, integration decisions, and repository-specific logic were written and adapted specifically for this project.
