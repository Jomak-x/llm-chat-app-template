import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownContentProps {
	source: string;
}

function normalizeMarkdownSource(source: string): string {
	return source
		.replace(/\r/g, "")
		.replace(/^\*\*([^*]+)\*\*\s+(.+)$/gm, "- **$1:** $2")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export function MarkdownContent({ source }: MarkdownContentProps) {
	return (
		<div className="markdown-content">
			<ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizeMarkdownSource(source)}</ReactMarkdown>
		</div>
	);
}
