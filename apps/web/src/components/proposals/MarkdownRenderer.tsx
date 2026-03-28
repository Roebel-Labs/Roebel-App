"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  return (
    <div
      className={`prose prose-sm max-w-none text-foreground ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings
          h1: ({ node, ...props }) => (
            <h1 className="text-3xl font-medium mt-6 mb-4 text-white" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="text-2xl font-medium mt-5 mb-3 text-white" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-xl font-medium mt-4 mb-2 text-white" {...props} />
          ),

          // Paragraphs
          p: ({ node, ...props }) => <p className="mb-4 leading-7 text-gray-300" {...props} />,

          // Lists
          ul: ({ node, ...props }) => (
            <ul className="list-disc list-inside mb-4 space-y-2 text-gray-300" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal list-inside mb-4 space-y-2 text-gray-300" {...props} />
          ),
          li: ({ node, ...props}) => <li className="ml-4" {...props} />,

          // Links
          a: ({ node, ...props }) => (
            <a
              className="text-blue-400 hover:text-blue-300 underline transition-colors"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),

          // Code
          code: ({ node, inline, ...props }: any) =>
            inline ? (
              <code
                className="bg-gray-800 text-pink-400 px-1.5 py-0.5 rounded text-sm font-mono"
                {...props}
              />
            ) : (
              <code
                className="block bg-gray-800 text-gray-300 p-4 rounded-lg overflow-x-auto text-sm font-mono"
                {...props}
              />
            ),

          pre: ({ node, ...props }) => (
            <pre className="bg-gray-800 p-4 rounded-lg overflow-x-auto mb-4" {...props} />
          ),

          // Blockquote
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="border-l-4 border-blue-500 pl-4 italic text-gray-400 my-4"
              {...props}
            />
          ),

          // Horizontal rule
          hr: ({ node, ...props }) => (
            <hr className="border-gray-700 my-6" {...props} />
          ),

          // Tables (GFM)
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-4">
              <table
                className="min-w-full border border-gray-700 rounded-lg"
                {...props}
              />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-gray-800" {...props} />
          ),
          tbody: ({ node, ...props }) => (
            <tbody className="divide-y divide-gray-700" {...props} />
          ),
          tr: ({ node, ...props }) => <tr {...props} />,
          th: ({ node, ...props }) => (
            <th
              className="px-4 py-2 text-left text-sm font-medium text-white"
              {...props}
            />
          ),
          td: ({ node, ...props }) => (
            <td className="px-4 py-2 text-sm text-gray-300" {...props} />
          ),

          // Strikethrough (GFM)
          del: ({ node, ...props }) => (
            <del className="text-gray-500" {...props} />
          ),

          // Strong/Bold
          strong: ({ node, ...props }) => (
            <strong className="font-medium text-white" {...props} />
          ),

          // Emphasis/Italic
          em: ({ node, ...props }) => (
            <em className="italic text-gray-300" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
