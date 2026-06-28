// Renders proposal bodies fetched from Irys. Content is either TipTap HTML
// (`<p>…`) or plain markdown — one path handles both: remark-gfm for markdown
// tables/strikethrough, rehype-raw so embedded raw HTML is parsed and rendered.
// Styled with explicit element overrides (navy accent, neutral text) so we don't
// need a Tailwind typography plugin. Parity with the apps/web MarkdownRenderer.
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

type El<T extends ElementType> = ComponentPropsWithoutRef<T>;

export default function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="text-[14px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          h1: (p: El<"h1">) => <h1 className="mb-3 mt-5 font-display text-xl font-bold tracking-tight text-foreground" {...p} />,
          h2: (p: El<"h2">) => <h2 className="mb-2.5 mt-5 font-display text-lg font-bold tracking-tight text-foreground" {...p} />,
          h3: (p: El<"h3">) => <h3 className="mb-2 mt-4 text-base font-semibold text-foreground" {...p} />,
          h4: (p: El<"h4">) => <h4 className="mb-1.5 mt-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground" {...p} />,
          p: (p: El<"p">) => <p className="mb-3 leading-relaxed text-foreground" {...p} />,
          a: ({ href, children }: El<"a">) => (
            <a href={href} target="_blank" rel="noreferrer" className="font-medium text-[#00498B] underline underline-offset-2 hover:no-underline">
              {children as ReactNode}
            </a>
          ),
          strong: (p: El<"strong">) => <strong className="font-semibold text-foreground" {...p} />,
          em: (p: El<"em">) => <em className="italic" {...p} />,
          ul: (p: El<"ul">) => <ul className="mb-3 ml-5 list-disc space-y-1.5 marker:text-muted-foreground" {...p} />,
          ol: (p: El<"ol">) => <ol className="mb-3 ml-5 list-decimal space-y-1.5 marker:text-muted-foreground" {...p} />,
          li: (p: El<"li">) => <li className="leading-relaxed" {...p} />,
          blockquote: (p: El<"blockquote">) => (
            <blockquote className="my-3 border-l-2 border-[#00498B] pl-3 text-muted-foreground italic" {...p} />
          ),
          hr: () => <hr className="my-5 border-border" />,
          img: ({ src, alt }: El<"img">) => (
            <img src={src} alt={alt ?? ""} className="my-3 max-w-full rounded-[10px] border border-border" loading="lazy" />
          ),
          code: ({ className, children }: El<"code">) => {
            const block = (className ?? "").includes("language-");
            if (block) {
              return <code className={`font-mono text-[12.5px] ${className ?? ""}`}>{children as ReactNode}</code>;
            }
            return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12.5px] text-foreground">{children as ReactNode}</code>;
          },
          pre: (p: El<"pre">) => (
            <pre className="my-3 overflow-x-auto rounded-[10px] border border-border bg-muted p-3 text-[12.5px]" {...p} />
          ),
          table: (p: El<"table">) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-[13px]" {...p} />
            </div>
          ),
          th: (p: El<"th">) => <th className="border border-border bg-muted px-2.5 py-1.5 text-left font-semibold" {...p} />,
          td: (p: El<"td">) => <td className="border border-border px-2.5 py-1.5 align-top" {...p} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
