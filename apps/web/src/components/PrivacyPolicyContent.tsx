"use client";

import { useEffect, useState } from "react";

interface PrivacyPolicyContentProps {
  content: string;
}

export default function PrivacyPolicyContent({
  content,
}: PrivacyPolicyContentProps) {
  const [sections, setSections] = useState<string[]>([]);
  const [activeSection, setActiveSection] = useState<string>("");

  useEffect(() => {
    // Parse markdown headers for table of contents
    const headers = content.match(/^## .+$/gm) || [];
    setSections(headers.map((h) => h.replace("## ", "")));

    // Setup intersection observer for active section tracking
    const observerOptions = {
      rootMargin: "-100px 0px -66%",
      threshold: 0,
    };

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id);
        }
      });
    };

    const observer = new IntersectionObserver(
      observerCallback,
      observerOptions
    );

    // Observe all h2 elements
    setTimeout(() => {
      document.querySelectorAll("h2[id]").forEach((el) => observer.observe(el));
    }, 100);

    return () => observer.disconnect();
  }, [content]);

  // Convert markdown to HTML (basic conversion)
  const renderMarkdown = (text: string) => {
    let html = text;

    // Headers
    html = html.replace(/^# (.+)$/gm, '<h1 id="$1">$1</h1>');
    html = html.replace(/^## (.+)$/gm, (match, p1) => {
      const id = p1.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      return `<h2 id="${id}" class="scroll-mt-24">${p1}</h2>`;
    });
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    // Italic
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

    // Links
    html = html.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    // Lists
    html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
    html = html.replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>");

    // Paragraphs
    html = html.replace(/^(?!<[hul]|---|\||\*\*)([\s\S]+?)$/gm, "<p>$1</p>");

    // Horizontal rules
    html = html.replace(/^---$/gm, "<hr />");

    // Code blocks
    html = html.replace(/```(\w+)?\n([\s\S]+?)```/g, "<pre><code>$2</code></pre>");

    // Inline code
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Checkboxes
    html = html.replace(/✅/g, '<span class="text-green-600">✅</span>');
    html = html.replace(/❌/g, '<span class="text-red-600">❌</span>');
    html = html.replace(/⚠️/g, '<span class="text-yellow-600">⚠️</span>');

    return html;
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(
      sectionId.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    );
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="flex gap-8">
      {/* Table of Contents - Desktop */}
      <aside className="hidden lg:block w-64 shrink-0">
        <div className="sticky top-24">
          <h2 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
            Inhaltsverzeichnis
          </h2>
          <nav className="space-y-1">
            {sections.map((section, index) => {
              const sectionId = section.toLowerCase().replace(/[^a-z0-9]+/g, "-");
              const isActive = activeSection === sectionId;

              return (
                <button
                  key={index}
                  onClick={() => scrollToSection(sectionId)}
                  className={`block w-full text-left text-sm px-3 py-2 rounded-lg transition-colors ${
                    isActive
                      ? "bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-200 font-medium"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  {section}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <article
        className="flex-1 prose prose-gray dark:prose-invert max-w-none
          prose-headings:font-medium
          prose-h1:text-4xl prose-h1:mb-4
          prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:pb-2 prose-h2:border-b prose-h2:border-gray-200 dark:prose-h2:border-gray-700
          prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3
          prose-h4:text-lg prose-h4:mt-4 prose-h4:mb-2
          prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-p:leading-relaxed
          prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
          prose-strong:text-gray-900 dark:prose-strong:text-white prose-strong:font-medium
          prose-ul:list-disc prose-ul:pl-6
          prose-ol:list-decimal prose-ol:pl-6
          prose-li:text-gray-700 dark:prose-li:text-gray-300
          prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
          prose-pre:bg-gray-100 dark:prose-pre:bg-gray-800 prose-pre:p-4 prose-pre:rounded-lg
          prose-hr:border-gray-200 dark:prose-hr:border-gray-700"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
      />
    </div>
  );
}
