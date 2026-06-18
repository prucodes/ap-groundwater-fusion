"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { districtGeometry, titleCase } from "../lib/data";
import { IconActivity, IconArrowRight, IconInfo, IconSatellite } from "./icons";

const QUICK = [
  "Summarize the situation and recommend an irrigation action.",
  "Which signal is most concerning here and why?",
  "Is this district safe to draw groundwater this season?",
];

export function AiBrief({ district: controlledDistrict, onDistrictChange }: { district?: string; onDistrictChange?: (d: string) => void } = {}) {
  const districts = [...districtGeometry.districts].sort((a, b) => a.d.localeCompare(b.d));
  const [internalDistrict, setInternalDistrict] = useState(districts[0]?.d ?? "");
  const district = controlledDistrict ?? internalDistrict;
  const setDistrict = onDistrictChange ?? setInternalDistrict;
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");

  async function run(q: string) {
    setLoading(true);
    setText("");
    setNote("");
    setSource("");
    try {
      const res = await fetch("/api/ai-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ district, question: q }),
      });
      const data = await res.json();
      setText(data.text ?? data.error ?? "No response.");
      setSource(data.source ?? "");
      setNote(data.note ?? "");
    } catch {
      setText("Could not reach the briefing service.");
    } finally {
      setLoading(false);
    }
  }

  const isAi = source === "claude-opus-4-8";

  return (
    <div className="aiBrief">
      <div className="aiBriefControls">
        <select className="aiSelect" value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="District">
          {districts.map((d) => (
            <option key={d.d} value={d.d}>{titleCase(d.d)}</option>
          ))}
        </select>
        <input
          className="aiInput"
          placeholder="Ask anything — e.g. ‘most stressed mandals’, ‘pumping-pressure hotspots’, a mandal's level…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") run(question); }}
        />
        <button className="aiGenBtn" type="button" onClick={() => run(question)} disabled={loading}>
          {loading ? <span className="aiSpin" /> : <IconActivity />}
          {loading ? "Thinking…" : "Generate"}
        </button>
      </div>

      <div className="aiQuick">
        {QUICK.map((q) => (
          <button key={q} type="button" className="aiChip" onClick={() => { setQuestion(q); run(q); }} disabled={loading}>
            {q} <IconArrowRight />
          </button>
        ))}
      </div>

      {text && (
        <motion.div
          className="aiResult"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="aiResultHead">
            <span className={`aiSourceTag ${isAi ? "ai" : "det"}`}>
              <IconSatellite /> {isAi ? "AI · Claude Opus 4.8" : "Deterministic briefing"}
            </span>
          </div>
          <p className="aiResultText">{text}</p>
          {note && <div className="aiNote"><IconInfo /> {note}</div>}
        </motion.div>
      )}

      <div className="aiFootNote">
        <IconInfo />
        <span>
          Numbers are <strong>computed deterministically</strong> from the fused district signals; only the wording is
          AI-generated. The model is instructed to use only the given figures and never to invent a value — percentiles
          are stress/trend, not depth.
        </span>
      </div>
    </div>
  );
}
