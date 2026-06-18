"use client";

import { useState } from "react";
import { IconCheck, IconCopy } from "./icons";

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlight(json: string) {
  const escaped = escapeHtml(json);
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = "n";
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "k" : "s";
      } else if (/true|false/.test(match)) {
        cls = "b";
      } else if (/null/.test(match)) {
        cls = "p";
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

export function ActionOutputPreview({ payload, title = "AWARE / APWRIMS Action Output (Preview)" }: { payload: unknown; title?: string }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(payload, null, 2);

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable in some contexts; ignore */
    }
  }

  return (
    <div className="jsonPreview">
      <div className="jsonHead">
        <span className="jsonTitle">
          <span className="jsonDots">
            <span />
            <span />
            <span />
          </span>
          {title}
        </span>
        <button className="copyBtn" type="button" onClick={copy}>
          {copied ? <IconCheck /> : <IconCopy />}
          {copied ? "Copied" : "Copy JSON"}
        </button>
      </div>
      <pre className="jsonBody" dangerouslySetInnerHTML={{ __html: highlight(json) }} />
    </div>
  );
}
