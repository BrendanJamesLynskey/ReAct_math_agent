import { useState, useRef, useEffect, useCallback } from "react";

/*
 * ════════════════════════════════════════════════════════════════
 *  ReAct Math Agent — Ollama / Qwen3
 *  Visualises Thought → Action → Observation loops in real time
 * ════════════════════════════════════════════════════════════════
 */

// ── Math Tools ──────────────────────────────────────────────────
const safeMathEval = (expr) => {
  try {
    const s = expr
      .replace(/\^/g, "**")
      .replace(/sqrt\(/gi, "Math.sqrt(")
      .replace(/cbrt\(/gi, "Math.cbrt(")
      .replace(/abs\(/gi, "Math.abs(")
      .replace(/sin\(/gi, "Math.sin(")
      .replace(/cos\(/gi, "Math.cos(")
      .replace(/tan\(/gi, "Math.tan(")
      .replace(/asin\(/gi, "Math.asin(")
      .replace(/acos\(/gi, "Math.acos(")
      .replace(/atan\(/gi, "Math.atan(")
      .replace(/log10\(/gi, "Math.log10(")
      .replace(/log2\(/gi, "Math.log2(")
      .replace(/log\(/gi, "Math.log10(")
      .replace(/ln\(/gi, "Math.log(")
      .replace(/exp\(/gi, "Math.exp(")
      .replace(/floor\(/gi, "Math.floor(")
      .replace(/ceil\(/gi, "Math.ceil(")
      .replace(/round\(/gi, "Math.round(")
      .replace(/min\(/gi, "Math.min(")
      .replace(/max\(/gi, "Math.max(")
      .replace(/\bpi\b/gi, "Math.PI")
      .replace(/\be\b/gi, "Math.E")
      .replace(/mod/gi, "%")
      .replace(/(\d+)!/g, (_, n) => {
        let r = 1; for (let i = 2; i <= +n; i++) r *= i; return r;
      });
    if (/[^0-9+\-*/().%,\s\w]/.test(s.replace(/Math\.\w+/g, ""))) {
      return { ok: false, error: "Unsafe expression" };
    }
    const result = new Function(`"use strict"; return (${s})`)();
    return { ok: true, result: Number(result) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

const TOOL_DEFS = [
  {
    name: "calculate",
    desc: "Evaluate a mathematical expression. Supports +, -, *, /, ^, sqrt, sin, cos, tan, log, ln, exp, pi, e, factorial (!), abs, floor, ceil, round, min, max.",
    run: (input) => {
      const r = safeMathEval(input);
      return r.ok ? `${r.result}` : `Error: ${r.error}`;
    },
  },
  {
    name: "solve_quadratic",
    desc: "Solve ax²+bx+c=0. Input: a,b,c as comma-separated numbers.",
    run: (input) => {
      const parts = input.split(",").map((x) => parseFloat(x.trim()));
      if (parts.length !== 3 || parts.some(isNaN))
        return "Error: provide a,b,c as three comma-separated numbers";
      const [a, b, c] = parts;
      if (a === 0) return b === 0 ? (c === 0 ? "Infinite solutions" : "No solution") : `x = ${-c / b}`;
      const disc = b * b - 4 * a * c;
      if (disc < 0) {
        const real = (-b / (2 * a)).toFixed(6);
        const imag = (Math.sqrt(-disc) / (2 * a)).toFixed(6);
        return `x = ${real} ± ${imag}i (complex roots)`;
      }
      const x1 = ((-b + Math.sqrt(disc)) / (2 * a)).toFixed(6);
      const x2 = ((-b - Math.sqrt(disc)) / (2 * a)).toFixed(6);
      return x1 === x2 ? `x = ${x1} (double root)` : `x₁ = ${x1}, x₂ = ${x2}`;
    },
  },
  {
    name: "factor",
    desc: "Find prime factorization of a positive integer.",
    run: (input) => {
      let n = parseInt(input.trim());
      if (isNaN(n) || n < 2) return "Error: provide a positive integer >= 2";
      const factors = [];
      for (let d = 2; d * d <= n; d++) {
        while (n % d === 0) { factors.push(d); n /= d; }
      }
      if (n > 1) factors.push(n);
      return factors.join(" × ");
    },
  },
  {
    name: "gcd_lcm",
    desc: "Find GCD and LCM of two integers. Input: a,b as comma-separated.",
    run: (input) => {
      const parts = input.split(",").map((x) => parseInt(x.trim()));
      if (parts.length !== 2 || parts.some(isNaN)) return "Error: provide two comma-separated integers";
      let [a, b] = parts.map(Math.abs);
      const product = a * b;
      let [x, y] = [a, b];
      while (y) { [x, y] = [y, x % y]; }
      return `GCD(${a}, ${b}) = ${x}, LCM(${a}, ${b}) = ${product / x}`;
    },
  },
  {
    name: "statistics",
    desc: "Compute mean, median, std dev for a list of numbers. Input: comma-separated numbers.",
    run: (input) => {
      const nums = input.split(",").map((x) => parseFloat(x.trim())).filter((x) => !isNaN(x));
      if (!nums.length) return "Error: provide comma-separated numbers";
      const n = nums.length;
      const mean = nums.reduce((a, b) => a + b, 0) / n;
      const sorted = [...nums].sort((a, b) => a - b);
      const median = n % 2 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
      const variance = nums.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
      const stddev = Math.sqrt(variance);
      return `n=${n}, mean=${mean.toFixed(4)}, median=${median}, stddev=${stddev.toFixed(4)}`;
    },
  },
  {
    name: "convert_base",
    desc: "Convert a number between bases. Input: number, from_base, to_base (comma-separated). Example: 255,10,16",
    run: (input) => {
      const parts = input.split(",").map((s) => s.trim());
      if (parts.length !== 3) return "Error: provide number,from_base,to_base";
      const [numStr, fromStr, toStr] = parts;
      const from = parseInt(fromStr), to = parseInt(toStr);
      if (isNaN(from) || isNaN(to) || from < 2 || from > 36 || to < 2 || to > 36)
        return "Error: bases must be 2-36";
      const dec = parseInt(numStr, from);
      if (isNaN(dec)) return `Error: '${numStr}' is not valid in base ${from}`;
      return `${numStr} (base ${from}) = ${dec.toString(to).toUpperCase()} (base ${to})`;
    },
  },
];

const TOOL_LIST_FOR_PROMPT = TOOL_DEFS.map(
  (t) => `  - ${t.name}: ${t.desc}`
).join("\n");

// ── System Prompt ───────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a precise mathematics ReAct agent. You solve math problems step-by-step using a Thought/Action/Observation loop.

Available tools:
${TOOL_LIST_FOR_PROMPT}

IMPORTANT RULES:
1. You MUST follow this exact format for each step. Each step has a Thought, then an Action.
2. Format for using a tool:
Thought: <your reasoning about what to do next>
Action: tool_name(input)

3. After you receive an Observation (tool result), continue with another Thought/Action or give the final answer.
4. When you have the final answer, use:
Thought: <final reasoning>
Action: finish(your final answer here)

5. Be precise. Show your mathematical reasoning in Thoughts.
6. Use tools for computation — do NOT compute in your head.
7. Keep thoughts concise but clear.
8. Do NOT output Observation lines yourself — the system provides those.

/no_think`;

// ── Ollama call ─────────────────────────────────────────────────
const callOllama = async (messages, model, base, signal) => {
  const url = `${base.replace(/\/+$/, "")}/api/chat`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: { temperature: 0, num_predict: 1024 },
    }),
  });
  if (!resp.ok) throw new Error(`Ollama ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return data.message?.content ?? "";
};

// ── Parse LLM output ────────────────────────────────────────────
const parseResponse = (text) => {
  const thoughts = [];
  const lines = text.split("\n");
  let currentThought = null;
  let currentAction = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (/^Thought:\s*/i.test(line)) {
      if (currentThought && currentAction) {
        thoughts.push({ thought: currentThought, action: currentAction });
        currentAction = null;
      }
      currentThought = line.replace(/^Thought:\s*/i, "");
    } else if (/^Action:\s*/i.test(line)) {
      currentAction = line.replace(/^Action:\s*/i, "");
    } else if (currentThought && !currentAction) {
      currentThought += " " + line;
    }
  }
  if (currentThought && currentAction) {
    thoughts.push({ thought: currentThought, action: currentAction });
  }
  if (!thoughts.length && text.includes("(")) {
    const m = text.match(/(finish|calculate|solve_quadratic|factor|gcd_lcm|statistics|convert_base)\((.+?)\)/i);
    if (m) thoughts.push({ thought: text.split(m[0])[0].replace(/^Thought:\s*/i, "").trim() || "(implicit reasoning)", action: `${m[1]}(${m[2]})` });
  }
  return thoughts;
};

const parseAction = (action) => {
  const m = action.match(/^(\w+)\((.+)\)$/s);
  if (!m) return null;
  return { tool: m[1].toLowerCase(), input: m[2].trim().replace(/^["']|["']$/g, "") };
};

// ── Stage types ─────────────────────────────────────────────────
const STAGE = { IDLE: "idle", THINKING: "thinking", THOUGHT: "thought", ACTION: "action", OBSERVATION: "observation", ANSWER: "answer", ERROR: "error" };
const STAGE_META = {
  [STAGE.IDLE]:        { label: "Idle",           color: "#475569", icon: "◇" },
  [STAGE.THINKING]:    { label: "LLM Generating", color: "#f59e0b", icon: "⟳" },
  [STAGE.THOUGHT]:     { label: "Thought",        color: "#3b82f6", icon: "◆" },
  [STAGE.ACTION]:      { label: "Action",         color: "#8b5cf6", icon: "▶" },
  [STAGE.OBSERVATION]: { label: "Observation",    color: "#10b981", icon: "◉" },
  [STAGE.ANSWER]:      { label: "Final Answer",   color: "#f43f5e", icon: "★" },
  [STAGE.ERROR]:       { label: "Error",          color: "#ef4444", icon: "✕" },
};

// ────────────────────────────────────────────────────────────────
//  Component
// ────────────────────────────────────────────────────────────────
export default function ReActMathAgent() {
  const [ollamaBase, setOllamaBase] = useState("http://localhost:11434");
  const [model, setModel] = useState("qwen3");
  const [question, setQuestion] = useState("");
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState([]);
  const [currentStage, setCurrentStage] = useState(STAGE.IDLE);
  const [finalAnswer, setFinalAnswer] = useState(null);
  const [error, setError] = useState(null);
  const [loopCount, setLoopCount] = useState(0);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const finishedRef = useRef(false);
  const MAX_LOOPS = 12;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [steps]);

  const addStep = useCallback((stage, text) => {
    const entry = { stage, text, ts: Date.now() };
    setSteps((p) => [...p, entry]);
    setCurrentStage(stage);
    return entry;
  }, []);

  const runAgent = useCallback(async () => {
    if (!question.trim()) return;
    setRunning(true);
    setSteps([]);
    setFinalAnswer(null);
    setError(null);
    setLoopCount(0);
    setCurrentStage(STAGE.THINKING);
    finishedRef.current = false;

    const controller = new AbortController();
    abortRef.current = controller;

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: question.trim() },
    ];

    let loops = 0;

    try {
      while (loops < MAX_LOOPS && !finishedRef.current) {
        loops++;
        setLoopCount(loops);

        addStep(STAGE.THINKING, `Calling ${model} (loop ${loops})…`);
        const raw = await callOllama(messages, model, ollamaBase, controller.signal);
        messages.push({ role: "assistant", content: raw });

        const parsed = parseResponse(raw);
        if (!parsed.length) {
          addStep(STAGE.ANSWER, raw.trim());
          setFinalAnswer(raw.trim());
          setCurrentStage(STAGE.ANSWER);
          break;
        }

        for (const step of parsed) {
          if (finishedRef.current) break;

          addStep(STAGE.THOUGHT, step.thought);
          await new Promise((r) => setTimeout(r, 300));

          const act = parseAction(step.action);
          if (!act) {
            addStep(STAGE.ERROR, `Could not parse action: ${step.action}`);
            continue;
          }

          if (act.tool === "finish") {
            addStep(STAGE.ANSWER, act.input);
            setFinalAnswer(act.input);
            setCurrentStage(STAGE.ANSWER);
            finishedRef.current = true;
            break;
          }

          addStep(STAGE.ACTION, `${act.tool}(${act.input})`);
          await new Promise((r) => setTimeout(r, 200));

          const toolDef = TOOL_DEFS.find((t) => t.name === act.tool);
          const observation = toolDef
            ? toolDef.run(act.input)
            : `Error: unknown tool "${act.tool}"`;

          addStep(STAGE.OBSERVATION, observation);

          messages.push({
            role: "user",
            content: `Observation: ${observation}`,
          });

          await new Promise((r) => setTimeout(r, 200));
        }
      }

      if (!finishedRef.current && loops >= MAX_LOOPS) {
        addStep(STAGE.ERROR, `Reached maximum loop count (${MAX_LOOPS})`);
        setCurrentStage(STAGE.ERROR);
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        const msg = e.message || String(e);
        addStep(STAGE.ERROR, msg);
        setError(msg);
        setCurrentStage(STAGE.ERROR);
      }
    } finally {
      setRunning(false);
    }
  }, [question, model, ollamaBase, addStep]);

  const handleStop = () => {
    abortRef.current?.abort();
    finishedRef.current = true;
    setRunning(false);
    setCurrentStage(STAGE.IDLE);
  };

  const pipelineStages = [STAGE.THINKING, STAGE.THOUGHT, STAGE.ACTION, STAGE.OBSERVATION, STAGE.ANSWER];

  const examples = [
    "What is the prime factorization of 2310?",
    "Solve x² - 5x + 6 = 0 then calculate the sum of the roots squared.",
    "What is the GCD of 462 and 1071? Then compute 462/GCD.",
    "Convert 255 to base 2, then find the square root of the result in decimal.",
    "Find the mean and standard deviation of 12, 15, 18, 22, 30, 35, 42",
  ];

  return (
    <div style={S.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes glow { 0%,100%{box-shadow:0 0 8px var(--c)} 50%{box-shadow:0 0 24px var(--c)} }
        @keyframes borderPulse { 0%,100%{border-color:#f43f5e} 50%{border-color:#f43f5e88} }
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0f172a; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
      `}</style>

      {/* Header */}
      <header style={S.header}>
        <div style={S.headerLeft}>
          <div style={S.logo}>
            <span style={S.logoIcon}>∑</span>
            <span style={S.logoText}>ReAct Math Agent</span>
          </div>
          <span style={S.badge}>Ollama · Qwen3</span>
        </div>
        <div style={S.headerRight}>
          <div style={S.configRow}>
            <label style={S.configLabel}>Endpoint</label>
            <input style={S.configInput} value={ollamaBase} onChange={(e) => setOllamaBase(e.target.value)} />
          </div>
          <div style={S.configRow}>
            <label style={S.configLabel}>Model</label>
            <select style={{ ...S.configInput, width: 260, cursor: "pointer" }} value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="qwen3">qwen3</option>
              <option value="qwen3-coder_30b_temp0_unslothfix">qwen3-coder (30B unslothfix)</option>
            </select>
          </div>
        </div>
      </header>

      {/* Pipeline Visualiser */}
      <div style={S.pipelineBar}>
        <div style={S.pipelineLabel}>LOOP {loopCount || "—"}</div>
        <div style={S.pipelineTrack}>
          {pipelineStages.map((s, i) => {
            const meta = STAGE_META[s];
            const isActive = currentStage === s;
            const isPast = pipelineStages.indexOf(currentStage) > i;
            const isFinal = s === STAGE.ANSWER && currentStage === STAGE.ANSWER;
            return (
              <div key={s} style={{ display: "flex", alignItems: "center" }}>
                {i > 0 && (
                  <div style={{
                    width: 48, height: 2,
                    background: isPast || isActive ? meta.color : "#334155",
                    transition: "background .4s",
                  }} />
                )}
                <div
                  style={{
                    ...S.pipelineNode,
                    "--c": meta.color,
                    borderColor: isActive || isPast || isFinal ? meta.color : "#334155",
                    background: isActive ? meta.color + "22" : isFinal ? meta.color + "33" : "transparent",
                    animation: isActive && !isFinal ? "glow 1.5s ease-in-out infinite" : "none",
                    transform: isActive ? "scale(1.12)" : "scale(1)",
                    transition: "all .3s",
                  }}
                >
                  <span style={{ fontSize: 16 }}>{meta.icon}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, letterSpacing: ".05em",
                    color: isActive || isPast ? meta.color : "#64748b",
                  }}>
                    {meta.label.toUpperCase()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div style={S.pipelineLabel}>MAX {MAX_LOOPS}</div>
      </div>

      <div style={S.main}>
        {/* Left: Log */}
        <div style={S.logPane}>
          <div style={S.logHeader}>
            <span style={S.logTitle}>Agent Trace</span>
            {running && <span style={S.liveIndicator}>● LIVE</span>}
          </div>
          <div ref={scrollRef} style={S.logBody}>
            {steps.length === 0 && !running && (
              <div style={S.emptyLog}>
                <span style={{ fontSize: 40, opacity: 0.3 }}>∅</span>
                <p style={{ color: "#64748b", fontSize: 13 }}>Submit a math question to see the ReAct loop in action</p>
              </div>
            )}
            {steps.map((s, i) => {
              const meta = STAGE_META[s.stage];
              return (
                <div
                  key={i}
                  style={{
                    ...S.logEntry,
                    animation: "slideUp .3s ease-out forwards",
                    borderLeftColor: meta.color,
                  }}
                >
                  <div style={S.logEntryHeader}>
                    <span style={{ ...S.logStageTag, background: meta.color + "22", color: meta.color }}>
                      {meta.icon} {meta.label}
                    </span>
                    <span style={S.logTs}>+{((s.ts - (steps[0]?.ts ?? s.ts)) / 1000).toFixed(1)}s</span>
                  </div>
                  <pre style={S.logText}>{s.text}</pre>
                </div>
              );
            })}
            {running && (
              <div style={{ padding: "12px 16px", color: "#f59e0b", display: "flex", alignItems: "center", gap: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
                Processing…
              </div>
            )}
          </div>
        </div>

        {/* Right: Input + Diagram */}
        <div style={S.rightPane}>
          {/* Diagram */}
          <div style={S.diagram}>
            <div style={S.diagramTitle}>ReAct Loop Architecture</div>
            <svg viewBox="0 0 420 260" style={{ width: "100%", maxWidth: 420 }}>
              <defs>
                <marker id="ah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#64748b" />
                </marker>
              </defs>
              {/* User → Thought */}
              <line x1="70" y1="50" x2="155" y2="50" stroke="#475569" strokeWidth="1.5" markerEnd="url(#ah)" />
              {/* Thought → Action */}
              <line x1="260" y1="50" x2="345" y2="50" stroke="#475569" strokeWidth="1.5" markerEnd="url(#ah)" />
              {/* Action → Observation (down) */}
              <path d="M 370 70 L 370 140 L 345 140" fill="none" stroke="#475569" strokeWidth="1.5" markerEnd="url(#ah)" />
              {/* Observation → Thought (left+up) */}
              <path d="M 235 140 L 210 140 L 210 70" fill="none" stroke="#475569" strokeWidth="1.5" markerEnd="url(#ah)" />
              {/* Action → Finish */}
              <path d="M 370 70 L 370 210 L 260 210" fill="none" stroke="#475569" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#ah)" />
              {/* Loop label */}
              <text x="175" y="112" fill="#64748b" fontSize="9" fontFamily="JetBrains Mono" textAnchor="middle">loop</text>

              {[
                { x: 10, y: 30, w: 70, h: 40, label: "Question", color: "#94a3b8", stage: null },
                { x: 160, y: 30, w: 96, h: 40, label: "◆ Thought", color: "#3b82f6", stage: STAGE.THOUGHT },
                { x: 280, y: 30, w: 96, h: 40, label: "▶ Action", color: "#8b5cf6", stage: STAGE.ACTION },
                { x: 240, y: 120, w: 110, h: 40, label: "◉ Observe", color: "#10b981", stage: STAGE.OBSERVATION },
                { x: 160, y: 190, w: 96, h: 40, label: "★ Answer", color: "#f43f5e", stage: STAGE.ANSWER },
              ].map((n) => {
                const active = n.stage && currentStage === n.stage;
                return (
                  <g key={n.label}>
                    <rect
                      x={n.x} y={n.y} width={n.w} height={n.h} rx={8}
                      fill={active ? n.color + "33" : "#1e293b"}
                      stroke={active ? n.color : "#334155"}
                      strokeWidth={active ? 2 : 1}
                    />
                    <text
                      x={n.x + n.w / 2} y={n.y + n.h / 2 + 4}
                      fill={active ? n.color : "#94a3b8"}
                      fontSize="11" fontFamily="JetBrains Mono" fontWeight="500" textAnchor="middle"
                    >{n.label}</text>
                  </g>
                );
              })}

              <rect x="170" y="58" width="76" height="18" rx="4" fill="#0f172a" stroke="#f59e0b44" strokeWidth="1" />
              <text x="208" y="71" fill="#f59e0b" fontSize="8" fontFamily="JetBrains Mono" fontWeight="600" textAnchor="middle">LLM (Qwen3)</text>

              <rect x="335" y="86" width="70" height="18" rx="4" fill="#0f172a" stroke="#8b5cf644" strokeWidth="1" />
              <text x="370" y="99" fill="#8b5cf6" fontSize="8" fontFamily="JetBrains Mono" fontWeight="600" textAnchor="middle">Math Tools</text>
            </svg>
          </div>

          {/* Input */}
          <div style={S.inputCard}>
            <textarea
              style={S.textarea}
              rows={3}
              placeholder="Ask a math question…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !running) {
                  e.preventDefault();
                  runAgent();
                }
              }}
            />
            <div style={S.inputActions}>
              {running ? (
                <button style={{ ...S.btn, ...S.btnStop }} onClick={handleStop}>■ Stop</button>
              ) : (
                <button
                  style={{ ...S.btn, ...S.btnRun, opacity: question.trim() ? 1 : 0.4 }}
                  onClick={runAgent}
                  disabled={!question.trim()}
                >
                  ▶ Run Agent
                </button>
              )}
            </div>
          </div>

          {/* Final answer card */}
          {finalAnswer && (
            <div style={S.answerCard}>
              <div style={S.answerLabel}>★ FINAL ANSWER</div>
              <div style={S.answerText}>{finalAnswer}</div>
            </div>
          )}

          {error && !finalAnswer && (
            <div style={{ ...S.answerCard, borderColor: "#ef4444" }}>
              <div style={{ ...S.answerLabel, color: "#ef4444" }}>✕ ERROR</div>
              <div style={{ ...S.answerText, color: "#fca5a5" }}>{error}</div>
            </div>
          )}

          {/* Examples */}
          <div style={S.examplesCard}>
            <div style={S.examplesLabel}>Try an example</div>
            <div style={S.examplesGrid}>
              {examples.map((ex, i) => (
                <button
                  key={i}
                  style={S.exampleBtn}
                  onClick={() => { setQuestion(ex); setFinalAnswer(null); setSteps([]); setError(null); }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#3b82f6"; e.currentTarget.style.color = "#e2e8f0"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e293b"; e.currentTarget.style.color = "#94a3b8"; }}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {/* Tools reference */}
          <div style={S.toolsCard}>
            <div style={S.toolsLabel}>Available Tools</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {TOOL_DEFS.map((t) => (
                <span key={t.name} style={S.toolChip} title={t.desc}>{t.name}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────
const S = {
  root: {
    minHeight: "100vh",
    background: "#0b1120",
    color: "#e2e8f0",
    fontFamily: "'DM Sans', sans-serif",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 24px",
    borderBottom: "1px solid #1e293b",
    background: "#0f172a",
    flexWrap: "wrap",
    gap: 12,
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 14 },
  headerRight: { display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" },
  logo: { display: "flex", alignItems: "center", gap: 10 },
  logoIcon: {
    fontSize: 26, fontWeight: 700, color: "#3b82f6",
    fontFamily: "'JetBrains Mono', monospace",
  },
  logoText: { fontSize: 16, fontWeight: 700, letterSpacing: "-.02em" },
  badge: {
    fontSize: 10, fontWeight: 600, letterSpacing: ".06em",
    padding: "3px 10px", borderRadius: 20,
    background: "#1e293b", color: "#94a3b8",
    fontFamily: "'JetBrains Mono', monospace",
  },
  configRow: { display: "flex", alignItems: "center", gap: 6 },
  configLabel: {
    fontSize: 10, fontWeight: 600, color: "#64748b",
    textTransform: "uppercase", letterSpacing: ".06em",
    fontFamily: "'JetBrains Mono', monospace",
  },
  configInput: {
    background: "#1e293b", border: "1px solid #334155", borderRadius: 6,
    color: "#e2e8f0", padding: "5px 10px", fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace", outline: "none", width: 200,
  },
  pipelineBar: {
    display: "flex", alignItems: "center", gap: 16,
    padding: "10px 24px",
    background: "#0f172a88",
    borderBottom: "1px solid #1e293b",
    overflowX: "auto",
  },
  pipelineLabel: {
    fontSize: 10, fontWeight: 700, color: "#475569",
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: ".08em", whiteSpace: "nowrap",
  },
  pipelineTrack: { display: "flex", alignItems: "center", flex: 1, justifyContent: "center" },
  pipelineNode: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
    padding: "8px 14px", borderRadius: 10,
    border: "1.5px solid", minWidth: 80,
    fontFamily: "'JetBrains Mono', monospace",
  },
  main: { display: "flex", flex: 1, minHeight: 0, overflow: "hidden" },
  logPane: {
    flex: "1 1 50%", display: "flex", flexDirection: "column",
    borderRight: "1px solid #1e293b", minWidth: 0,
  },
  logHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 20px",
    background: "#0f172a", borderBottom: "1px solid #1e293b",
  },
  logTitle: {
    fontSize: 12, fontWeight: 700, letterSpacing: ".06em",
    color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace",
  },
  liveIndicator: {
    fontSize: 10, fontWeight: 700, color: "#f43f5e",
    animation: "pulse 1.2s ease-in-out infinite",
    fontFamily: "'JetBrains Mono', monospace",
  },
  logBody: {
    flex: 1, overflowY: "auto", padding: "12px 16px",
    display: "flex", flexDirection: "column", gap: 8,
  },
  emptyLog: {
    flex: 1, display: "flex", flexDirection: "column",
    justifyContent: "center", alignItems: "center", gap: 12, padding: 40,
  },
  logEntry: {
    borderLeft: "3px solid",
    background: "#0f172a",
    borderRadius: "0 8px 8px 0",
    padding: "10px 14px",
    opacity: 0,
    animationFillMode: "forwards",
  },
  logEntryHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  logStageTag: {
    fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
    fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".04em",
  },
  logTs: { fontSize: 10, color: "#475569", fontFamily: "'JetBrains Mono', monospace" },
  logText: {
    fontSize: 13, lineHeight: 1.55, color: "#cbd5e1",
    fontFamily: "'JetBrains Mono', monospace",
    whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0,
  },
  rightPane: {
    flex: "1 1 50%", display: "flex", flexDirection: "column",
    padding: 20, gap: 16, overflowY: "auto",
  },
  diagram: {
    background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12,
    padding: "16px 20px",
  },
  diagramTitle: {
    fontSize: 10, fontWeight: 700, color: "#475569",
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: ".08em", marginBottom: 8, textTransform: "uppercase",
  },
  inputCard: {
    background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12,
    padding: 16,
  },
  textarea: {
    width: "100%", background: "#1e293b", border: "1px solid #334155",
    borderRadius: 8, color: "#e2e8f0", padding: "10px 14px",
    fontSize: 14, fontFamily: "'DM Sans', sans-serif",
    resize: "vertical", outline: "none", lineHeight: 1.5,
    minHeight: 60,
  },
  inputActions: { display: "flex", justifyContent: "flex-end", marginTop: 10, gap: 8 },
  btn: {
    padding: "8px 20px", borderRadius: 8, border: "none",
    fontWeight: 600, fontSize: 13, cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    transition: "all .15s",
  },
  btnRun: { background: "#3b82f6", color: "#fff" },
  btnStop: { background: "#dc2626", color: "#fff" },
  answerCard: {
    background: "#0f172a", border: "1.5px solid #f43f5e",
    borderRadius: 12, padding: 16,
    animation: "slideUp .4s ease-out",
  },
  answerLabel: {
    fontSize: 10, fontWeight: 700, color: "#f43f5e",
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: ".08em", marginBottom: 8,
  },
  answerText: {
    fontSize: 16, fontWeight: 600, color: "#e2e8f0", lineHeight: 1.5,
    fontFamily: "'JetBrains Mono', monospace",
  },
  examplesCard: {
    background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12,
    padding: 16,
  },
  examplesLabel: {
    fontSize: 10, fontWeight: 700, color: "#475569",
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: ".08em", marginBottom: 10, textTransform: "uppercase",
  },
  examplesGrid: { display: "flex", flexDirection: "column", gap: 6 },
  exampleBtn: {
    background: "transparent", border: "1px solid #1e293b",
    borderRadius: 8, padding: "8px 12px",
    color: "#94a3b8", fontSize: 12, cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
    textAlign: "left", transition: "all .15s", lineHeight: 1.4,
  },
  toolsCard: {
    background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12,
    padding: 14,
  },
  toolsLabel: {
    fontSize: 10, fontWeight: 700, color: "#475569",
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: ".08em", marginBottom: 8, textTransform: "uppercase",
  },
  toolChip: {
    background: "#1e293b", border: "1px solid #334155",
    borderRadius: 6, padding: "3px 10px",
    fontSize: 11, color: "#94a3b8",
    fontFamily: "'JetBrains Mono', monospace",
  },
};
