import React, { useState, useEffect, useCallback } from "react";
import {
  NotebookPen,
  Sparkles,
  Inbox,
  Compass,
  Plus,
  Trash2,
  Loader2,
  Check,
} from "lucide-react";

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
  { key: "box", label: "潘多拉魔盒", icon: Inbox, color: COLORS.daily, soft: COLORS.dailySoft },
  { key: "guide", label: "罗盘指南", icon: Compass, color: COLORS.progress, soft: COLORS.progressSoft },
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
const fmtTime = (ts) => {
  try { return new Date(ts).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
};

async function callClaude(system, user) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
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

function extractJSON(text) {
  const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("没能解析出结果");
  return JSON.parse(cleaned.slice(start, end + 1));
}

const emptyData = () => ({ sessions: [], ideas: [], boxEntries: [], publishPlan: null });

// migrate older shapes so existing data isn't lost
function migrate(d) {
  const next = { ...emptyData(), ...d };
  if (!Array.isArray(next.boxEntries)) next.boxEntries = [];
  if (Array.isArray(d.dailyLogs) && d.dailyLogs.length && !d.boxEntries.length) {
    next.boxEntries = d.dailyLogs.map((l) => ({
      id: l.id || uid(),
      text: l.note || l.nextStep || "",
      createdAt: l.createdAt || Date.now(),
      triage: null,
      todoText: null,
      done: false,
    }));
  }
  next.boxEntries = next.boxEntries.map((e) => ({ triage: null, todoText: null, done: false, ...e }));
  if (!("publishPlan" in next)) next.publishPlan = d.progressOverview || null;
  return next;
}

// ---------- shared bits ----------
function Fonts() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
      .wb-display { font-family: 'Fraunces', serif; }
      .wb-body { font-family: 'Inter', sans-serif; }
      .wb-mono { font-family: 'IBM Plex Mono', monospace; }
    `}</style>
  );
}
function SectionLabel({ children, color }) {
  return <div className="wb-mono text-xs tracking-widest uppercase mb-3" style={{ color, letterSpacing: "0.12em" }}>{children}</div>;
}
function PrimaryButton({ onClick, disabled, children, color, icon: Icon }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="wb-body inline-flex items-center gap-2 px-4 py-2 rounded-sm text-sm font-medium transition-opacity disabled:opacity-50"
      style={{ backgroundColor: color, color: COLORS.paper }}>
      {disabled ? <Loader2 size={15} className="animate-spin" /> : Icon ? <Icon size={15} /> : null}
      {children}
    </button>
  );
}
function EmptyState({ text, color }) {
  return <div className="wb-body text-sm py-8 text-center rounded-sm border border-dashed" style={{ color: COLORS.inkSoft, borderColor: COLORS.line }}>{text}</div>;
}

// ---------- Coaching tab (unchanged) ----------
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
    setClient(""); setNotes(""); setDate(todayISO());
  };

  const summarize = async (session) => {
    setError(""); setBusyId(session.id);
    try {
      const summary = await callClaude(
        "你是一位经验丰富的教练督导（coaching supervisor），帮助教练复盘单次会谈。请始终用中文回复，语气直接、具体、有建设性，避免空泛的鼓励。",
        `以下是一次教练对话的记录或笔记（来访者：${session.client}，日期：${session.date}）：\n\n${session.notes}\n\n请按以下结构给出简短复盘（每部分2-4句即可）：\n1. 这次教练做得好的地方\n2. 可以提升的地方\n3. 来访者的核心议题与可能的反馈/收获`
      );
      mutate((d) => ({ ...d, sessions: d.sessions.map((s) => (s.id === session.id ? { ...s, summary } : s)) }));
      setExpanded((e) => ({ ...e, [session.id]: true }));
    } catch (e) { setError(e.message || "生成失败，请重试"); } finally { setBusyId(null); }
  };
  const remove = (id) => mutate((d) => ({ ...d, sessions: d.sessions.filter((s) => s.id !== id) }));

  return (
    <div>
      <SectionLabel color={COLORS.coaching}>记一次新的会谈</SectionLabel>
      <div className="space-y-2 mb-6">
        <div className="flex gap-2">
          <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="来访者（可留空）"
            className="wb-body flex-1 px-3 py-2 text-sm rounded-sm border bg-transparent outline-none" style={{ borderColor: COLORS.line, color: COLORS.ink }} />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="wb-mono px-3 py-2 text-sm rounded-sm border bg-transparent outline-none" style={{ borderColor: COLORS.line, color: COLORS.ink }} />
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="粘贴录音转写、笔记或回忆要点…" rows={4}
          className="wb-body w-full px-3 py-2 text-sm rounded-sm border bg-transparent outline-none resize-none" style={{ borderColor: COLORS.line, color: COLORS.ink }} />
        <PrimaryButton onClick={addSession} color={COLORS.coaching} icon={Plus}>归档</PrimaryButton>
      </div>
      {error && <div className="wb-body text-sm mb-3" style={{ color: COLORS.daily }}>{error}</div>}
      <SectionLabel color={COLORS.coaching}>会谈记录（{data.sessions.length}）</SectionLabel>
      {data.sessions.length === 0 ? <EmptyState text="还没有记录 — 上面归档你的第一次会谈" /> : (
        <div className="space-y-3">
          {data.sessions.map((s) => (
            <div key={s.id} className="rounded-sm border p-3" style={{ borderColor: COLORS.line }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="wb-display text-base" style={{ color: COLORS.ink }}>{s.client}</div>
                  <div className="wb-mono text-xs mt-0.5" style={{ color: COLORS.inkSoft }}>{fmtDate(s.date)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!s.summary && <PrimaryButton onClick={() => summarize(s)} disabled={busyId === s.id} color={COLORS.coaching}>AI 总结</PrimaryButton>}
                  <button onClick={() => remove(s.id)} className="p-1.5 opacity-60 hover:opacity-100"><Trash2 size={15} color={COLORS.inkSoft} /></button>
                  <button onClick={() => setExpanded((e) => ({ ...e, [s.id]: !e[s.id] }))} className="wb-mono text-xs px-2 py-1" style={{ color: COLORS.inkSoft }}>
                    {expanded[s.id] ? "收起" : "展开"}
                  </button>
                </div>
              </div>
              {expanded[s.id] && (
                <div className="mt-3 space-y-3">
                  {s.summary && <div className="wb-body text-sm whitespace-pre-wrap rounded-sm p-3" style={{ backgroundColor: COLORS.coachingSoft, color: COLORS.ink }}>{s.summary}</div>}
                  <details><summary className="wb-mono text-xs cursor-pointer" style={{ color: COLORS.inkSoft }}>原始笔记</summary>
                    <div className="wb-body text-sm mt-2 whitespace-pre-wrap" style={{ color: COLORS.inkSoft }}>{s.notes}</div></details>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Content tab (unchanged) ----------
const CONTENT_TAGS = ["自媒体", "脑洞", "其他"];
function ContentTab({ data, mutate }) {
  const [text, setText] = useState(""); const [tag, setTag] = useState(CONTENT_TAGS[0]);
  const add = () => { if (!text.trim()) return; mutate((d) => ({ ...d, ideas: [{ id: uid(), text: text.trim(), tag, createdAt: Date.now() }, ...d.ideas] })); setText(""); };
  const remove = (id) => mutate((d) => ({ ...d, ideas: d.ideas.filter((i) => i.id !== id) }));
  return (
    <div>
      <SectionLabel color={COLORS.content}>随手记一个想法</SectionLabel>
      <div className="space-y-2 mb-6">
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="自媒体选题、脑洞、随便想聊的什么…" rows={3}
          className="wb-body w-full px-3 py-2 text-sm rounded-sm border bg-transparent outline-none resize-none" style={{ borderColor: COLORS.line, color: COLORS.ink }} />
        <div className="flex items-center gap-2 flex-wrap">
          {CONTENT_TAGS.map((t) => (
            <button key={t} onClick={() => setTag(t)} className="wb-mono text-xs px-2.5 py-1 rounded-full border"
              style={{ borderColor: tag === t ? COLORS.content : COLORS.line, backgroundColor: tag === t ? COLORS.contentSoft : "transparent", color: tag === t ? COLORS.content : COLORS.inkSoft }}>{t}</button>
          ))}
          <div className="flex-1" />
          <PrimaryButton onClick={add} color={COLORS.content} icon={Plus}>记下来</PrimaryButton>
        </div>
      </div>
      <SectionLabel color={COLORS.content}>想法清单（{data.ideas.length}）</SectionLabel>
      {data.ideas.length === 0 ? <EmptyState text="脑洞还是空的 — 想到什么就写下来" /> : (
        <div className="space-y-2">
          {data.ideas.map((i) => (
            <div key={i.id} className="flex items-start gap-2 rounded-sm border p-3" style={{ borderColor: COLORS.line }}>
              <span className="wb-mono text-xs px-2 py-0.5 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: COLORS.contentSoft, color: COLORS.content }}>{i.tag}</span>
              <div className="wb-body text-sm flex-1" style={{ color: COLORS.ink }}>{i.text}</div>
              <button onClick={() => remove(i.id)} className="p-1 opacity-60 hover:opacity-100 shrink-0"><Trash2 size={14} color={COLORS.inkSoft} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- 潘多拉魔盒: pure fast capture, no AI at write time ----------
function PandoraTab({ data, mutate }) {
  const [text, setText] = useState("");
  const add = () => {
    if (!text.trim()) return;
    mutate((d) => ({ ...d, boxEntries: [{ id: uid(), text: text.trim(), createdAt: Date.now(), triage: null, todoText: null, done: false }, ...d.boxEntries] }));
    setText("");
  };
  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); add(); }
  };
  const remove = (id) => mutate((d) => ({ ...d, boxEntries: d.boxEntries.filter((b) => b.id !== id) }));

  return (
    <div>
      <SectionLabel color={COLORS.daily}>扔进来</SectionLabel>
      <div className="mb-6">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="做了什么、感受如何、突然冒出的什么念头… 敲回车"
          className="wb-body w-full px-3 py-2 text-sm rounded-sm border bg-transparent outline-none"
          style={{ borderColor: COLORS.line, color: COLORS.ink }}
        />
        <div className="wb-mono text-xs mt-2" style={{ color: COLORS.inkSoft }}>不用管它是什么，先记下来。整理在"罗盘指南"里做。</div>
      </div>
      <SectionLabel color={COLORS.daily}>记录（{data.boxEntries.length}）</SectionLabel>
      {data.boxEntries.length === 0 ? <EmptyState text="魔盒是空的 — 上面敲一条试试" /> : (
        <div className="space-y-2">
          {data.boxEntries.map((b) => (
            <div key={b.id} className="flex items-start gap-2 rounded-sm border p-3" style={{ borderColor: COLORS.line }}>
              <div className="flex-1">
                <div className="wb-body text-sm" style={{ color: COLORS.ink }}>{b.text}</div>
                <div className="wb-mono text-xs mt-1" style={{ color: COLORS.inkSoft }}>
                  {fmtTime(b.createdAt)}
                  {b.triage === "todo" && <span className="ml-2" style={{ color: COLORS.coaching }}>→ 已整理为待办</span>}
                  {b.triage === "thought" && <span className="ml-2">→ 已归类为想法</span>}
                </div>
              </div>
              <button onClick={() => remove(b.id)} className="p-1 opacity-60 hover:opacity-100 shrink-0"><Trash2 size={14} color={COLORS.inkSoft} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- 罗盘指南: the synthesis tab ----------
function GuideTab({ data, mutate }) {
  const [busyPlan, setBusyPlan] = useState(false);
  const [busyTriage, setBusyTriage] = useState(false);
  const [error, setError] = useState("");

  const untriaged = data.boxEntries.filter((b) => !b.triage);
  const todos = data.boxEntries.filter((b) => b.triage === "todo");

  const generatePlan = async () => {
    setError(""); setBusyPlan(true);
    try {
      const list = data.ideas.map((i) => `- [${i.tag}] ${i.text}（记于 ${fmtDate(new Date(i.createdAt).toISOString().slice(0,10))}）`).join("\n") || "（暂无想法）";
      const result = await callClaude(
        "你是帮助内容创作者规划发布节奏的助手。请始终用中文回复，具体到给出大致的发布顺序或时间安排，不要泛泛而谈。",
        `这是目前积累的创作想法：\n${list}\n\n请给出这些想法大致应该按什么顺序、什么时间节奏去发布或处理，哪些该优先。`
      );
      mutate((d) => ({ ...d, publishPlan: { text: result, generatedAt: Date.now() } }));
    } catch (e) { setError(e.message || "生成失败，请重试"); } finally { setBusyPlan(false); }
  };

  const triage = async () => {
    setError(""); setBusyTriage(true);
    try {
      const list = untriaged.map((b) => `- id: ${b.id}\n  内容: ${b.text}`).join("\n");
      const raw = await callClaude(
        "你是帮助整理个人碎片记录的助手。你会收到若干条随手记下的话，每条有一个id。请判断每一条是「待办事项」（有具体要去做的行动）还是「只是一个想法」（感受、随笔、没有具体行动）。如果是待办事项，尽量保留原文，不需要改写；如果原文已经很清楚就直接原样返回。只返回JSON数组，不要有任何其他文字或解释，格式：[{\"id\":\"xxx\",\"type\":\"todo\",\"text\":\"...\"},{\"id\":\"xxx\",\"type\":\"thought\"}]",
        `待分类的条目：\n${list}`
      );
      const parsed = extractJSON(raw);
      mutate((d) => ({
        ...d,
        boxEntries: d.boxEntries.map((b) => {
          const match = parsed.find((p) => p.id === b.id);
          if (!match) return b;
          return match.type === "todo"
            ? { ...b, triage: "todo", todoText: match.text || b.text }
            : { ...b, triage: "thought" };
        }),
      }));
    } catch (e) { setError(e.message || "整理失败，请重试"); } finally { setBusyTriage(false); }
  };

  const toggleDone = (id) => mutate((d) => ({ ...d, boxEntries: d.boxEntries.map((b) => (b.id === id ? { ...b, done: !b.done } : b)) }));
  const removeTodo = (id) => mutate((d) => ({ ...d, boxEntries: d.boxEntries.filter((b) => b.id !== id) }));

  return (
    <div>
      <SectionLabel color={COLORS.content}>创作发布建议</SectionLabel>
      <div className="mb-6">
        <PrimaryButton onClick={generatePlan} disabled={busyPlan} color={COLORS.content} icon={Sparkles}>
          生成发布建议
        </PrimaryButton>
        {data.publishPlan && (
          <div className="wb-body text-sm whitespace-pre-wrap rounded-sm p-3 mt-3" style={{ backgroundColor: COLORS.contentSoft, color: COLORS.ink }}>
            {data.publishPlan.text}
          </div>
        )}
      </div>

      <SectionLabel color={COLORS.daily}>整理待办（潘多拉魔盒）</SectionLabel>
      <div className="mb-3">
        <PrimaryButton onClick={triage} disabled={busyTriage || untriaged.length === 0} color={COLORS.daily} icon={Inbox}>
          {untriaged.length === 0 ? "没有新记录待整理" : `整理 ${untriaged.length} 条新记录`}
        </PrimaryButton>
      </div>
      {error && <div className="wb-body text-sm mb-3" style={{ color: COLORS.daily }}>{error}</div>}

      <div className="mb-6">
        {todos.length === 0 ? <EmptyState text="还没有待办事项 — 整理一下魔盒里的记录试试" /> : (
          <div className="space-y-2">
            {todos.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-sm border p-3" style={{ borderColor: COLORS.line }}>
                <button onClick={() => toggleDone(t.id)}
                  className="w-5 h-5 rounded-sm border flex items-center justify-center shrink-0"
                  style={{ borderColor: COLORS.coaching, backgroundColor: t.done ? COLORS.coaching : "transparent" }}>
                  {t.done && <Check size={13} color={COLORS.paper} />}
                </button>
                <div className="wb-body text-sm flex-1" style={{ color: t.done ? COLORS.inkSoft : COLORS.ink, textDecoration: t.done ? "line-through" : "none" }}>
                  {t.todoText || t.text}
                </div>
                <button onClick={() => removeTodo(t.id)} className="p-1 opacity-60 hover:opacity-100 shrink-0"><Trash2 size={14} color={COLORS.inkSoft} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <SectionLabel color={COLORS.progress}>累计概览</SectionLabel>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-sm border p-4" style={{ borderColor: COLORS.line }}>
          <div className="wb-display text-3xl" style={{ color: COLORS.progress }}>{data.sessions.length}</div>
          <div className="wb-mono text-xs mt-1" style={{ color: COLORS.inkSoft }}>教练会谈</div>
        </div>
        <div className="rounded-sm border p-4" style={{ borderColor: COLORS.line }}>
          <div className="wb-display text-3xl" style={{ color: COLORS.progress }}>{data.ideas.length}</div>
          <div className="wb-mono text-xs mt-1" style={{ color: COLORS.inkSoft }}>创作想法</div>
        </div>
      </div>
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
        if (res && res.value) setData(migrate(JSON.parse(res.value)));
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

  return (
    <div className="min-h-screen wb-body" style={{ backgroundColor: COLORS.paper }}>
      <Fonts />
      <div className="max-w-3xl mx-auto px-4 py-6">
        <header className="mb-6">
          <div className="wb-display text-2xl" style={{ color: COLORS.ink }}>执业工作台</div>
          <div className="wb-mono text-xs mt-1" style={{ color: COLORS.inkSoft }}>coaching · content · pandora · guide</div>
        </header>

        <nav className="flex gap-1 mb-6 border-b" style={{ borderColor: COLORS.line }}>
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = t.key === active;
            return (
              <button key={t.key} onClick={() => setActive(t.key)}
                className="wb-body flex-1 flex flex-col items-center gap-1 pb-2 pt-1 text-xs relative"
                style={{ color: isActive ? t.color : COLORS.inkSoft }}>
                <Icon size={17} /><span>{t.label}</span>
                {isActive && <span className="absolute -bottom-px left-0 right-0 h-0.5" style={{ backgroundColor: t.color }} />}
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
              {active === "box" && <PandoraTab data={data} mutate={mutate} />}
              {active === "guide" && <GuideTab data={data} mutate={mutate} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
