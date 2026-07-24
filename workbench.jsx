import React, { useState, useEffect, useCallback } from "react";
import {
  NotebookPen,
  Sparkles,
  Compass,
  TrendingUp,
  Plus,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts";

// ---------- design tokens ----------
const COLORS = {
  paper: "#E9E4D4",
  paperDeep: "#DCD5BF",
  ink: "#2B2A28",
  inkSoft: "#5C574C",
  coaching: "#3F6259",
  coachingSoft: "#DCE7E2",
  content: "#B07E2C",
  contentSoft: "#F0E3C8",
  daily: "#A15242",
  dailySoft: "#F1DCD5",
  progress: "#3B5674",
  progressSoft: "#DCE3EC",
  line: "#C9C1AA",
};

const TABS = [
  { key: "coaching", label: "教练日志", icon: NotebookPen, color: COLORS.coaching, soft: COLORS.coachingSoft },
  { key: "content", label: "创作火花", icon: Sparkles, color: COLORS.content, soft: COLORS.contentSoft },
  { key: "daily", label: "每日罗盘", icon: Compass, color: COLORS.daily, soft: COLORS.dailySoft },
  { key: "progress", label: "进度地图", icon: TrendingUp, color: COLORS.progress, soft: COLORS.progressSoft },
];

const STORAGE_KEY = "workbench-data";

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso) => {
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", weekday: "short" });
  } catch {
    return iso;
  }
};

async function callClaude(system, user) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error("API 请求失败：" + res.status);
  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("没有收到有效回复");
  return text;
}

const emptyData = () => ({ sessions: [], ideas: [], dailyLogs: [], progressOverview: null });

// ---------- shared bits ----------
function Fonts() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
      .wb-display { font-family: 'Fraunces', serif; }
      .wb-body { font-family: 'Inter', sans-serif; }
      .wb-mono { font-family: 'IBM Plex Mono', monospace; }
      .wb-scroll::-webkit-scrollbar { width: 6px; }
      .wb-scroll::-webkit-scrollbar-thumb { background: ${COLORS.line}; border-radius: 3px; }
    `}</style>
  );
}

function SectionLabel({ children, color }) {
  return (
    <div
      className="wb-mono text-xs tracking-widest uppercase mb-3"
      style={{ color, letterSpacing: "0.12em" }}
    >
      {children}
    </div>
  );
}

function PrimaryButton({ onClick, disabled, children, color, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="wb-body inline-flex items-center gap-2 px-4 py-2 rounded-sm text-sm font-medium transition-opacity disabled:opacity-50"
      style={{ backgroundColor: color, color: COLORS.paper }}
    >
      {disabled ? <Loader2 size={15} className="animate-spin" /> : Icon ? <Icon size={15} /> : null}
      {children}
    </button>
  );
}

function EmptyState({ text, color }) {
  return (
    <div
      className="wb-body text-sm py-8 text-center rounded-sm border border-dashed"
      style={{ color: COLORS.inkSoft, borderColor: COLORS.line }}
    >
      {text}
    </div>
  );
}

// ---------- Coaching tab ----------
function CoachingTab({ data, mutate }) {
  const [client, setClient] = useState("");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState({});

  const addSession = () => {
    if (!notes.trim()) return;
    const entry = { id: uid(), client: client.trim() || "未命名来访者", date, notes: notes.trim(), summary: null, createdAt: Date.now() };
    mutate((d) => ({ ...d, sessions: [entry, ...d.sessions] }));
    setClient("");
    setNotes("");
    setDate(todayISO());
  };

  const summarize = async (session) => {
    setError("");
    setBusyId(session.id);
    try {
      const summary = await callClaude(
        "你是一位经验丰富的教练督导（coaching supervisor），帮助教练复盘单次会谈。请始终用中文回复，语气直接、具体、有建设性，避免空泛的鼓励。",
        `以下是一次教练对话的记录或笔记（来访者：${session.client}，日期：${session.date}）：\n\n${session.notes}\n\n请按以下结构给出简短复盘（每部分2-4句即可）：\n1. 这次教练做得好的地方\n2. 可以提升的地方\n3. 来访者的核心议题与可能的反馈/收获`
      );
      mutate((d) => ({
        ...d,
        sessions: d.sessions.map((s) => (s.id === session.id ? { ...s, summary } : s)),
      }));
      setExpanded((e) => ({ ...e, [session.id]: true }));
    } catch (e) {
      setError(e.message || "生成失败，请重试");
    } finally {
      setBusyId(null);
    }
  };

  const remove = (id) => mutate((d) => ({ ...d, sessions: d.sessions.filter((s) => s.id !== id) }));

  return (
    <div>
      <SectionLabel color={COLORS.coaching}>记一次新的会谈</SectionLabel>
      <div className="space-y-2 mb-6">
        <div className="flex gap-2">
          <input
            value={client}
            onChange={(e) => setClient(e.target.value)}
            placeholder="来访者（可留空）"
            className="wb-body flex-1 px-3 py-2 text-sm rounded-sm border bg-transparent outline-none"
            style={{ borderColor: COLORS.line, color: COLORS.ink }}
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="wb-mono px-3 py-2 text-sm rounded-sm border bg-transparent outline-none"
            style={{ borderColor: COLORS.line, color: COLORS.ink }}
          />
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="粘贴录音转写、笔记或回忆要点…"
          rows={4}
          className="wb-body w-full px-3 py-2 text-sm rounded-sm border bg-transparent outline-none resize-none"
          style={{ borderColor: COLORS.line, color: COLORS.ink }}
        />
        <PrimaryButton onClick={addSession} color={COLORS.coaching} icon={Plus}>
          归档
        </PrimaryButton>
      </div>

      {error && <div className="wb-body text-sm mb-3" style={{ color: COLORS.daily }}>{error}</div>}

      <SectionLabel color={COLORS.coaching}>会谈记录（{data.sessions.length}）</SectionLabel>
      {data.sessions.length === 0 ? (
        <EmptyState text="还没有记录 — 上面归档你的第一次会谈" color={COLORS.coaching} />
      ) : (
        <div className="space-y-3">
          {data.sessions.map((s) => (
            <div key={s.id} className="rounded-sm border p-3" style={{ borderColor: COLORS.line }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="wb-display text-base" style={{ color: COLORS.ink }}>{s.client}</div>
                  <div className="wb-mono text-xs mt-0.5" style={{ color: COLORS.inkSoft }}>{fmtDate(s.date)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!s.summary && (
                    <PrimaryButton onClick={() => summarize(s)} disabled={busyId === s.id} color={COLORS.coaching}>
                      AI 总结
                    </PrimaryButton>
                  )}
                  <button onClick={() => remove(s.id)} className="p-1.5 opacity-60 hover:opacity-100">
                    <Trash2 size={15} color={COLORS.inkSoft} />
                  </button>
                  <button onClick={() => setExpanded((e) => ({ ...e, [s.id]: !e[s.id] }))} className="p-1.5">
                    {expanded[s.id] ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                </div>
              </div>
              {expanded[s.id] && (
                <div className="mt-3 space-y-3">
                  {s.summary && (
                    <div
                      className="wb-body text-sm whitespace-pre-wrap rounded-sm p-3"
                      style={{ backgroundColor: COLORS.coachingSoft, color: COLORS.ink }}
                    >
                      {s.summary}
                    </div>
                  )}
                  <details>
                    <summary className="wb-mono text-xs cursor-pointer" style={{ color: COLORS.inkSoft }}>原始笔记</summary>
                    <div className="wb-body text-sm mt-2 whitespace-pre-wrap" style={{ color: COLORS.inkSoft }}>{s.notes}</div>
                  </details>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Content tab ----------
const CONTENT_TAGS = ["自媒体", "脑洞", "其他"];

function ContentTab({ data, mutate }) {
  const [text, setText] = useState("");
  const [tag, setTag] = useState(CONTENT_TAGS[0]);

  const add = () => {
    if (!text.trim()) return;
    const entry = { id: uid(), text: text.trim(), tag, createdAt: Date.now() };
    mutate((d) => ({ ...d, ideas: [entry, ...d.ideas] }));
    setText("");
  };
  const remove = (id) => mutate((d) => ({ ...d, ideas: d.ideas.filter((i) => i.id !== id) }));

  return (
    <div>
      <SectionLabel color={COLORS.content}>随手记一个想法</SectionLabel>
      <div className="space-y-2 mb-6">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="自媒体选题、脑洞、随便想聊的什么…"
          rows={3}
          className="wb-body w-full px-3 py-2 text-sm rounded-sm border bg-transparent outline-none resize-none"
          style={{ borderColor: COLORS.line, color: COLORS.ink }}
        />
        <div className="flex items-center gap-2 flex-wrap">
          {CONTENT_TAGS.map((t) => (
            <button
              key={t}
              onClick={() => setTag(t)}
              className="wb-mono text-xs px-2.5 py-1 rounded-full border"
              style={{
                borderColor: tag === t ? COLORS.content : COLORS.line,
                backgroundColor: tag === t ? COLORS.contentSoft : "transparent",
                color: tag === t ? COLORS.content : COLORS.inkSoft,
              }}
            >
              {t}
            </button>
          ))}
          <div className="flex-1" />
          <PrimaryButton onClick={add} color={COLORS.content} icon={Plus}>
            记下来
          </PrimaryButton>
        </div>
      </div>

      <SectionLabel color={COLORS.content}>想法清单（{data.ideas.length}）</SectionLabel>
      {data.ideas.length === 0 ? (
        <EmptyState text="脑洞还是空的 — 想到什么就写下来" color={COLORS.content} />
      ) : (
        <div className="space-y-2">
          {data.ideas.map((i) => (
            <div key={i.id} className="flex items-start gap-2 rounded-sm border p-3" style={{ borderColor: COLORS.line }}>
              <span
                className="wb-mono text-xs px-2 py-0.5 rounded-full shrink-0 mt-0.5"
                style={{ backgroundColor: COLORS.contentSoft, color: COLORS.content }}
              >
                {i.tag}
              </span>
              <div className="wb-body text-sm flex-1" style={{ color: COLORS.ink }}>{i.text}</div>
              <button onClick={() => remove(i.id)} className="p-1 opacity-60 hover:opacity-100 shrink-0">
                <Trash2 size={14} color={COLORS.inkSoft} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Daily tab ----------
function DailyTab({ data, mutate }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const generateNextStep = async () => {
    setError("");
    setBusy(true);
    try {
      const recentSessions = data.sessions.slice(0, 3).map((s) => `- ${s.date} ${s.client}: ${s.summary || s.notes}`).join("\n") || "（暂无）";
      const recentIdeas = data.ideas.slice(0, 5).map((i) => `- [${i.tag}] ${i.text}`).join("\n") || "（暂无）";
      const recentDaily = data.dailyLogs.slice(0, 3).map((d) => `- ${d.date}: ${d.note}`).join("\n") || "（暂无）";
      const result = await callClaude(
        "你是一位帮助独立执业者（教练/内容创作者）保持推进节奏的助手。请始终用中文回复，简洁、具体，直接给出可执行的下一步，不要泛泛而谈。",
        `这是我的执业情况快照。\n\n最近的教练会谈：\n${recentSessions}\n\n最近的创作想法：\n${recentIdeas}\n\n最近几天的日常记录：\n${recentDaily}\n\n今天的记录：\n${note || "（暂无）"}\n\n请给出：\n1. 现在最重要的下一步是什么（1条，具体到可以直接去做）\n2. 另外2-3件值得关注但不紧急的事`
      );
      const entry = { id: uid(), date: todayISO(), note: note.trim(), nextStep: result, createdAt: Date.now() };
      mutate((d) => ({ ...d, dailyLogs: [entry, ...d.dailyLogs] }));
      setNote("");
    } catch (e) {
      setError(e.message || "生成失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  const remove = (id) => mutate((d) => ({ ...d, dailyLogs: d.dailyLogs.filter((l) => l.id !== id) }));

  return (
    <div>
      <SectionLabel color={COLORS.daily}>今天</SectionLabel>
      <div className="space-y-2 mb-6">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="今天做了什么、感受如何…（可留空，直接生成建议）"
          rows={3}
          className="wb-body w-full px-3 py-2 text-sm rounded-sm border bg-transparent outline-none resize-none"
          style={{ borderColor: COLORS.line, color: COLORS.ink }}
        />
        <PrimaryButton onClick={generateNextStep} disabled={busy} color={COLORS.daily} icon={Compass}>
          生成今日下一步
        </PrimaryButton>
      </div>
      {error && <div className="wb-body text-sm mb-3" style={{ color: COLORS.daily }}>{error}</div>}

      <SectionLabel color={COLORS.daily}>历史记录（{data.dailyLogs.length}）</SectionLabel>
      {data.dailyLogs.length === 0 ? (
        <EmptyState text="还没有生成过 — 上面点一下试试" color={COLORS.daily} />
      ) : (
        <div className="space-y-3">
          {data.dailyLogs.map((l) => (
            <div key={l.id} className="rounded-sm border p-3" style={{ borderColor: COLORS.line }}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="wb-mono text-xs" style={{ color: COLORS.inkSoft }}>{fmtDate(l.date)}</div>
                <button onClick={() => remove(l.id)} className="p-1 opacity-60 hover:opacity-100">
                  <Trash2 size={14} color={COLORS.inkSoft} />
                </button>
              </div>
              {l.note && <div className="wb-body text-sm mb-2" style={{ color: COLORS.ink }}>{l.note}</div>}
              <div className="wb-body text-sm whitespace-pre-wrap rounded-sm p-3" style={{ backgroundColor: COLORS.dailySoft, color: COLORS.ink }}>
                {l.nextStep}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Progress tab ----------
function weekBuckets(items, dateField) {
  const map = {};
  items.forEach((it) => {
    const d = new Date((it[dateField] || todayISO()) + (it[dateField]?.length === 10 ? "T00:00:00" : ""));
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7);
    const key = `${d.getFullYear()}-W${week}`;
    map[key] = (map[key] || 0) + 1;
  });
  return Object.entries(map)
    .sort((a, b) => (a[0] > b[0] ? 1 : -1))
    .slice(-8)
    .map(([k, v]) => ({ week: k.split("-W")[1] ? "W" + k.split("-W")[1] : k, count: v }));
}

function ProgressTab({ data, mutate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sessionWeeks = weekBuckets(
    data.sessions.map((s) => ({ date: s.date })),
    "date"
  );

  const generateOverview = async () => {
    setError("");
    setBusy(true);
    try {
      const sessionCount = data.sessions.length;
      const ideaCount = data.ideas.length;
      const lastSummaries = data.sessions.slice(0, 5).map((s) => s.summary).filter(Boolean).join("\n---\n") || "（暂无）";
      const result = await callClaude(
        "你是一位帮助独立执业者回顾整体进展的助手。请始终用中文回复，先说现状（2-3句），再说未来展望（2-3句），语气务实、鼓励但不空洞。",
        `目前累计教练会谈 ${sessionCount} 次，累计创作想法 ${ideaCount} 条。\n\n最近几次会谈复盘摘录：\n${lastSummaries}\n\n请给出这个执业阶段的现状小结和未来展望。`
      );
      mutate((d) => ({ ...d, progressOverview: { text: result, generatedAt: Date.now() } }));
    } catch (e) {
      setError(e.message || "生成失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionLabel color={COLORS.progress}>累计概览</SectionLabel>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-sm border p-4" style={{ borderColor: COLORS.line }}>
          <div className="wb-display text-3xl" style={{ color: COLORS.progress }}>{data.sessions.length}</div>
          <div className="wb-mono text-xs mt-1" style={{ color: COLORS.inkSoft }}>教练会谈</div>
        </div>
        <div className="rounded-sm border p-4" style={{ borderColor: COLORS.line }}>
          <div className="wb-display text-3xl" style={{ color: COLORS.progress }}>{data.ideas.length}</div>
          <div className="wb-mono text-xs mt-1" style={{ color: COLORS.inkSoft }}>创作想法</div>
        </div>
      </div>

      <SectionLabel color={COLORS.progress}>每周会谈节奏</SectionLabel>
      <div className="h-40 mb-6">
        {sessionWeeks.length === 0 ? (
          <EmptyState text="累积几次会谈后，这里会显示节奏图" color={COLORS.progress} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sessionWeeks}>
              <CartesianGrid stroke={COLORS.line} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: COLORS.inkSoft }} axisLine={{ stroke: COLORS.line }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: COLORS.inkSoft }} axisLine={false} tickLine={false} width={24} />
              <Tooltip contentStyle={{ fontSize: 12, borderColor: COLORS.line }} />
              <Bar dataKey="count" fill={COLORS.progress} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <SectionLabel color={COLORS.progress}>阶段性展望</SectionLabel>
      <PrimaryButton onClick={generateOverview} disabled={busy} color={COLORS.progress} icon={TrendingUp}>
        生成现状与展望
      </PrimaryButton>
      {error && <div className="wb-body text-sm mt-3" style={{ color: COLORS.daily }}>{error}</div>}
      {data.progressOverview && (
        <div
          className="wb-body text-sm whitespace-pre-wrap rounded-sm p-3 mt-3"
          style={{ backgroundColor: COLORS.progressSoft, color: COLORS.ink }}
        >
          {data.progressOverview.text}
        </div>
      )}
    </div>
  );
}

// ---------- App ----------
export default function Workbench() {
  const [active, setActive] = useState("coaching");
  const [data, setData] = useState(emptyData());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res && res.value) setData(JSON.parse(res.value));
      } catch {
        // no existing data yet
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const mutate = useCallback((updater) => {
    setData((prev) => {
      const next = updater(prev);
      window.storage.set(STORAGE_KEY, JSON.stringify(next), false).catch(() => {});
      return next;
    });
  }, []);

  const activeTab = TABS.find((t) => t.key === active);

  return (
    <div className="min-h-screen wb-body" style={{ backgroundColor: COLORS.paper }}>
      <Fonts />
      <div className="max-w-3xl mx-auto px-4 py-6">
        <header className="mb-6">
          <div className="wb-display text-2xl" style={{ color: COLORS.ink }}>执业工作台</div>
          <div className="wb-mono text-xs mt-1" style={{ color: COLORS.inkSoft }}>coaching · content · compass · progress</div>
        </header>

        <nav className="flex gap-1 mb-6 border-b" style={{ borderColor: COLORS.line }}>
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = t.key === active;
            return (
              <button
                key={t.key}
                onClick={() => setActive(t.key)}
                className="wb-body flex-1 flex flex-col items-center gap-1 pb-2 pt-1 text-xs relative"
                style={{ color: isActive ? t.color : COLORS.inkSoft }}
              >
                <Icon size={17} />
                <span>{t.label}</span>
                {isActive && (
                  <span
                    className="absolute -bottom-px left-0 right-0 h-0.5"
                    style={{ backgroundColor: t.color }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        <main>
          {!loaded ? (
            <div className="wb-body text-sm py-12 text-center" style={{ color: COLORS.inkSoft }}>加载中…</div>
          ) : (
            <>
              {active === "coaching" && <CoachingTab data={data} mutate={mutate} />}
              {active === "content" && <ContentTab data={data} mutate={mutate} />}
              {active === "daily" && <DailyTab data={data} mutate={mutate} />}
              {active === "progress" && <ProgressTab data={data} mutate={mutate} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
