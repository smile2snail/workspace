import React, { useState, useEffect, useCallback } from "react";
import {
  NotebookPen,
  Sparkles,
  ListChecks,
  Inbox,
  Wand2,
  Plus,
  Trash2,
  Loader2,
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
  { key: "coaching", label: "教练日志", icon: NotebookPen, color: COLORS.coaching },
  { key: "content", label: "创作火花", icon: Sparkles, color: COLORS.content },
  { key: "box", label: "待办事项", icon: ListChecks, color: COLORS.daily },
  { key: "guide", label: "潘多拉魔盒", icon: Inbox, color: COLORS.progress },
];

const STORAGE_KEY = "workbench-data";
const ACC_CUTOFF = "2026-07-10";
const CONTENT_TAGS = ["自媒体", "播客", "其他"];

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso) => {
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", weekday: "short" });
  } catch { return iso; }
};
const fmtTime = (ts) => {
  try { return new Date(ts).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
};

async function callClaude(system, user, maxTokens) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens || 1200,
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

const emptyData = () => ({ sessions: [], ideas: [], todoEntries: [], pandoraEntries: [], coachingOverview: null, boxReflection: null });

// migrate older shapes so existing data isn't lost
function migrate(d) {
  const next = { ...emptyData(), ...d };

  // old shared "boxEntries" -> becomes todoEntries (that's where her real entries like "zinnia的牙医" live)
  if (Array.isArray(d.boxEntries) && !Array.isArray(d.todoEntries)) {
    next.todoEntries = d.boxEntries;
  }
  if (!Array.isArray(next.todoEntries)) next.todoEntries = [];
  if (!Array.isArray(next.pandoraEntries)) next.pandoraEntries = [];
  if (Array.isArray(d.dailyLogs) && d.dailyLogs.length && !next.todoEntries.length) {
    next.todoEntries = d.dailyLogs.map((l) => ({ id: l.id || uid(), text: l.note || l.nextStep || "", createdAt: l.createdAt || Date.now() }));
  }
  next.todoEntries = next.todoEntries.map((e) => ({ text: "", createdAt: Date.now(), done: false, ...e }));
  next.pandoraEntries = next.pandoraEntries.map((e) => ({ text: "", createdAt: Date.now(), ...e }));

  next.sessions = (next.sessions || []).map((s) => {
    const transcript = s.transcript !== undefined ? s.transcript : (s.notes || "");
    return { hours: 1, paymentType: "paid", clientSummary: "", ...s, transcript };
  });

  next.ideas = (next.ideas || []).map((i) => {
    if (i.title !== undefined) return { appendix: "", content: "", ...i, tag: i.tag === "脑洞" ? "播客" : i.tag };
    return { id: i.id, tag: i.tag === "脑洞" ? "播客" : (i.tag || "其他"), title: i.text || "", content: "", appendix: "", createdAt: i.createdAt || Date.now() };
  });

  if (!("coachingOverview" in next)) next.coachingOverview = null;
  if (!("boxReflection" in next)) next.boxReflection = null;
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
function EmptyState({ text }) {
  return <div className="wb-body text-sm py-8 text-center rounded-sm border border-dashed" style={{ color: COLORS.inkSoft, borderColor: COLORS.line }}>{text}</div>;
}
function PillButton({ active, onClick, children, color, soft }) {
  return (
    <button onClick={onClick} className="wb-mono text-xs px-2.5 py-1 rounded-full border"
      style={{ borderColor: active ? color : COLORS.line, backgroundColor: active ? soft : "transparent", color: active ? color : COLORS.inkSoft }}>
      {children}
    </button>
  );
}

// ---------- Coaching tab ----------
function CoachingTab({ data, mutate }) {
  const [client, setClient] = useState("");
  const [date, setDate] = useState(todayISO());
  const [hours, setHours] = useState("1");
  const [paymentType, setPaymentType] = useState("paid");
  const [transcript, setTranscript] = useState("");
  const [clientSummary, setClientSummary] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [busyOverview, setBusyOverview] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [filter, setFilter] = useState("全部");

  const addSession = () => {
    if (!transcript.trim()) return;
    const entry = {
      id: uid(), client: client.trim() || "未命名来访者", date,
      hours: parseFloat(hours) || 0, paymentType,
      transcript: transcript.trim(), clientSummary: clientSummary.trim(),
      summary: null, createdAt: Date.now(),
    };
    mutate((d) => ({ ...d, sessions: [entry, ...d.sessions] }));
    setClient(""); setTranscript(""); setClientSummary(""); setDate(todayISO()); setHours("1"); setPaymentType("paid");
  };

  const summarize = async (session) => {
    setError(""); setBusyId(session.id);
    try {
      const summary = await callClaude(
        "你是一位经验丰富的教练督导（coaching supervisor），帮助教练复盘单次会谈。请始终用中文回复，语气直接、具体、有建设性，避免空泛的鼓励。",
        `以下是一次教练对话的记录或笔记（来访者：${session.client}，日期：${session.date}）：\n\n${session.transcript}\n\n请按以下结构给出简短复盘（每部分2-4句即可）：\n1. 这次教练做得好的地方\n2. 可以提升的地方\n3. 来访者的核心议题与可能的反馈/收获`
      );
      mutate((d) => ({ ...d, sessions: d.sessions.map((s) => (s.id === session.id ? { ...s, summary } : s)) }));
      setExpanded((e) => ({ ...e, [session.id]: true }));
    } catch (e) { setError(e.message || "生成失败，请重试"); } finally { setBusyId(null); }
  };

  const generateOverview = async () => {
    setError(""); setBusyOverview(true);
    try {
      const list = [...data.sessions].reverse()
        .map((s) => `- ${s.date} ${s.client}：${s.summary || s.transcript}`)
        .join("\n") || "（暂无记录）";
      const result = await callClaude(
        "你是一位教练成长顾问，帮助教练回顾一段时间以来所有的会谈记录，梳理成长脉络。请始终用中文回复，具体、有洞察力，避免空泛的鼓励话术。",
        `以下是我目前所有的教练会谈记录（按时间顺序）：\n\n${list}\n\n请帮我梳理：\n1. 整体上我在哪些方面明显进步了\n2. 我比较擅长的技能/风格是什么\n3. 我还需要继续提升的地方是什么`,
        1500
      );
      mutate((d) => ({ ...d, coachingOverview: { text: result, generatedAt: Date.now() } }));
    } catch (e) { setError(e.message || "生成失败，请重试"); } finally { setBusyOverview(false); }
  };

  const remove = (id) => mutate((d) => ({ ...d, sessions: d.sessions.filter((s) => s.id !== id) }));

  const startEdit = (s) => { setEditingId(s.id); setEditDraft({ ...s }); };
  const saveEdit = () => {
    mutate((d) => ({ ...d, sessions: d.sessions.map((s) => (s.id === editDraft.id ? { ...editDraft, hours: parseFloat(editDraft.hours) || 0 } : s)) }));
    setEditingId(null); setEditDraft(null);
  };

  const countedSessions = data.sessions.filter((s) => s.date >= ACC_CUTOFF);
  const totalHours = countedSessions.reduce((sum, s) => sum + (s.hours || 0), 0);
  const paidHours = countedSessions.filter((s) => s.paymentType === "paid").reduce((sum, s) => sum + (s.hours || 0), 0);
  const proBonoHours = countedSessions.filter((s) => s.paymentType === "pro_bono").reduce((sum, s) => sum + (s.hours || 0), 0);
  const countedProBono = Math.min(proBonoHours, 25);
  const countableTotal = paidHours + countedProBono;
  const hoursToGo = Math.max(0, 100 - countableTotal);
  const paidGap = Math.max(0, 75 - paidHours);

  const filteredSessions = data.sessions.filter((s) => {
    if (filter === "全部") return true;
    if (filter === "付费") return s.paymentType === "paid";
    return s.paymentType === "pro_bono";
  });

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
        <div className="flex gap-2 items-center flex-wrap">
          <input type="number" step="0.5" min="0" value={hours} onChange={(e) => setHours(e.target.value)}
            className="wb-mono w-24 px-3 py-2 text-sm rounded-sm border bg-transparent outline-none" style={{ borderColor: COLORS.line, color: COLORS.ink }} />
          <span className="wb-mono text-xs" style={{ color: COLORS.inkSoft }}>小时</span>
          <div className="flex-1" />
          <PillButton active={paymentType === "paid"} onClick={() => setPaymentType("paid")} color={COLORS.coaching} soft={COLORS.coachingSoft}>付费</PillButton>
          <PillButton active={paymentType === "pro_bono"} onClick={() => setPaymentType("pro_bono")} color={COLORS.coaching} soft={COLORS.coachingSoft}>Pro Bono</PillButton>
        </div>
        <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="语音转写…" rows={4}
          className="wb-body w-full px-3 py-2 text-sm rounded-sm border bg-transparent outline-none resize-none" style={{ borderColor: COLORS.line, color: COLORS.ink }} />
        {paymentType === "paid" && (
          <textarea value={clientSummary} onChange={(e) => setClientSummary(e.target.value)} placeholder="发给客户的总结（可选）" rows={3}
            className="wb-body w-full px-3 py-2 text-sm rounded-sm border bg-transparent outline-none resize-none" style={{ borderColor: COLORS.line, color: COLORS.ink }} />
        )}
        <PrimaryButton onClick={addSession} color={COLORS.coaching} icon={Plus}>归档</PrimaryButton>
      </div>

      {error && <div className="wb-body text-sm mb-3" style={{ color: COLORS.daily }}>{error}</div>}

      <div className="flex items-center gap-2 mb-3">
        <SectionLabel color={COLORS.coaching}>会谈记录（{filteredSessions.length}）</SectionLabel>
      </div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {["全部", "付费", "Pro Bono"].map((f) => (
          <PillButton key={f} active={filter === f} onClick={() => setFilter(f)} color={COLORS.coaching} soft={COLORS.coachingSoft}>{f}</PillButton>
        ))}
      </div>
      {filteredSessions.length === 0 ? <EmptyState text="没有符合条件的记录" /> : (
        <div className="space-y-3 mb-8">
          {filteredSessions.map((s) => (
            <div key={s.id} className="rounded-sm border p-3" style={{ borderColor: COLORS.line }}>
              {editingId === s.id ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input value={editDraft.client} onChange={(e) => setEditDraft({ ...editDraft, client: e.target.value })}
                      className="wb-body flex-1 px-3 py-2 text-sm rounded-sm border bg-transparent outline-none" style={{ borderColor: COLORS.line, color: COLORS.ink }} />
                    <input type="date" value={editDraft.date} onChange={(e) => setEditDraft({ ...editDraft, date: e.target.value })}
                      className="wb-mono px-3 py-2 text-sm rounded-sm border bg-transparent outline-none" style={{ borderColor: COLORS.line, color: COLORS.ink }} />
                  </div>
                  <div className="flex gap-2 items-center flex-wrap">
                    <input type="number" step="0.5" min="0" value={editDraft.hours} onChange={(e) => setEditDraft({ ...editDraft, hours: e.target.value })}
                      className="wb-mono w-24 px-3 py-2 text-sm rounded-sm border bg-transparent outline-none" style={{ borderColor: COLORS.line, color: COLORS.ink }} />
                    <span className="wb-mono text-xs" style={{ color: COLORS.inkSoft }}>小时</span>
                    <div className="flex-1" />
                    <PillButton active={editDraft.paymentType === "paid"} onClick={() => setEditDraft({ ...editDraft, paymentType: "paid" })} color={COLORS.coaching} soft={COLORS.coachingSoft}>付费</PillButton>
                    <PillButton active={editDraft.paymentType === "pro_bono"} onClick={() => setEditDraft({ ...editDraft, paymentType: "pro_bono" })} color={COLORS.coaching} soft={COLORS.coachingSoft}>Pro Bono</PillButton>
                  </div>
                  <textarea value={editDraft.transcript} onChange={(e) => setEditDraft({ ...editDraft, transcript: e.target.value })} rows={4}
                    className="wb-body w-full px-3 py-2 text-sm rounded-sm border bg-transparent outline-none resize-none" style={{ borderColor: COLORS.line, color: COLORS.ink }} />
                  {editDraft.paymentType === "paid" && (
                    <textarea value={editDraft.clientSummary} onChange={(e) => setEditDraft({ ...editDraft, clientSummary: e.target.value })} rows={3}
                      placeholder="发给客户的总结"
                      className="wb-body w-full px-3 py-2 text-sm rounded-sm border bg-transparent outline-none resize-none" style={{ borderColor: COLORS.line, color: COLORS.ink }} />
                  )}
                  <div className="flex gap-2">
                    <PrimaryButton onClick={saveEdit} color={COLORS.coaching}>保存</PrimaryButton>
                    <button onClick={() => { setEditingId(null); setEditDraft(null); }} className="wb-mono text-xs px-3" style={{ color: COLORS.inkSoft }}>取消</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="wb-display text-base" style={{ color: COLORS.ink }}>{s.client}</div>
                      <div className="wb-mono text-xs mt-0.5" style={{ color: COLORS.inkSoft }}>
                        {fmtDate(s.date)} · {s.hours}h · {s.paymentType === "paid" ? "付费" : "Pro Bono"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!s.summary && <PrimaryButton onClick={() => summarize(s)} disabled={busyId === s.id} color={COLORS.coaching}>AI 总结</PrimaryButton>}
                      <button onClick={() => startEdit(s)} className="wb-mono text-xs px-2 py-1" style={{ color: COLORS.inkSoft }}>更改</button>
                      <button onClick={() => remove(s.id)} className="p-1.5 opacity-60 hover:opacity-100"><Trash2 size={15} color={COLORS.inkSoft} /></button>
                      <button onClick={() => setExpanded((e) => ({ ...e, [s.id]: !e[s.id] }))} className="wb-mono text-xs px-2 py-1" style={{ color: COLORS.inkSoft }}>
                        {expanded[s.id] ? "收起" : "展开"}
                      </button>
                    </div>
                  </div>
                  {expanded[s.id] && (
                    <div className="mt-3 space-y-3">
                      {s.summary && (
                        <div>
                          <div className="wb-mono text-xs mb-1" style={{ color: COLORS.inkSoft }}>AI 督导总结</div>
                          <div className="wb-body text-sm whitespace-pre-wrap rounded-sm p-3" style={{ backgroundColor: COLORS.coachingSoft, color: COLORS.ink }}>{s.summary}</div>
                        </div>
                      )}
                      {s.clientSummary && (
                        <div>
                          <div className="wb-mono text-xs mb-1" style={{ color: COLORS.inkSoft }}>发给客户的总结</div>
                          <div className="wb-body text-sm whitespace-pre-wrap rounded-sm p-3" style={{ backgroundColor: COLORS.paperDeep, color: COLORS.ink }}>{s.clientSummary}</div>
                        </div>
                      )}
                      <details><summary className="wb-mono text-xs cursor-pointer" style={{ color: COLORS.inkSoft }}>语音转写</summary>
                        <div className="wb-body text-sm mt-2 whitespace-pre-wrap" style={{ color: COLORS.inkSoft }}>{s.transcript}</div></details>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <SectionLabel color={COLORS.coaching}>整体成长脉络</SectionLabel>
      <div className="mb-6">
        <PrimaryButton onClick={generateOverview} disabled={busyOverview || data.sessions.length === 0} color={COLORS.coaching} icon={Sparkles}>
          AI 总结全部会谈
        </PrimaryButton>
        {data.coachingOverview && (
          <div className="wb-body text-sm whitespace-pre-wrap rounded-sm p-3 mt-3" style={{ backgroundColor: COLORS.coachingSoft, color: COLORS.ink }}>
            {data.coachingOverview.text}
          </div>
        )}
      </div>

      <SectionLabel color={COLORS.coaching}>累计概览</SectionLabel>
      <div className="wb-mono text-xs mb-3" style={{ color: COLORS.inkSoft }}>只计入 {ACC_CUTOFF} 及以后的会谈</div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-sm border p-4" style={{ borderColor: COLORS.line }}>
          <div className="wb-display text-3xl" style={{ color: COLORS.coaching }}>{countedSessions.length}</div>
          <div className="wb-mono text-xs mt-1" style={{ color: COLORS.inkSoft }}>累计场次</div>
        </div>
        <div className="rounded-sm border p-4" style={{ borderColor: COLORS.line }}>
          <div className="wb-display text-3xl" style={{ color: COLORS.coaching }}>{totalHours}</div>
          <div className="wb-mono text-xs mt-1" style={{ color: COLORS.inkSoft }}>累计小时</div>
        </div>
        <div className="rounded-sm border p-4" style={{ borderColor: COLORS.line }}>
          <div className="wb-display text-3xl" style={{ color: COLORS.coaching }}>{paidHours}</div>
          <div className="wb-mono text-xs mt-1" style={{ color: COLORS.inkSoft }}>付费小时</div>
        </div>
        <div className="rounded-sm border p-4" style={{ borderColor: COLORS.line }}>
          <div className="wb-display text-3xl" style={{ color: COLORS.coaching }}>{proBonoHours}</div>
          <div className="wb-mono text-xs mt-1" style={{ color: COLORS.inkSoft }}>Pro Bono 小时</div>
        </div>
      </div>
      <div className="rounded-sm border p-4" style={{ borderColor: COLORS.line, backgroundColor: COLORS.coachingSoft }}>
        <div className="wb-body text-sm" style={{ color: COLORS.ink }}>
          ACC 认证进度：已计入 <b>{countableTotal}</b> / 100 小时（付费 {paidHours}/75，Pro Bono {countedProBono}/25 封顶）
        </div>
        <div className="wb-body text-sm mt-1" style={{ color: COLORS.ink }}>
          距离 100 小时还差 <b>{hoursToGo}</b> 小时{paidGap > 0 ? `（其中付费小时还差 ${paidGap} 小时）` : ""}
        </div>
      </div>
    </div>
  );
}

// ---------- Content tab ----------
function ContentTab({ data, mutate }) {
  const [subTab, setSubTab] = useState(CONTENT_TAGS[0]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [appendix, setAppendix] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  const add = () => {
    if (!title.trim() || subTab === "所有") return;
    mutate((d) => ({
      ...d,
      ideas: [{ id: uid(), tag: subTab, title: title.trim(), content: content.trim(), appendix: appendix.trim(), createdAt: Date.now() }, ...d.ideas],
    }));
    setTitle(""); setContent(""); setAppendix("");
  };
  const remove = (id) => mutate((d) => ({ ...d, ideas: d.ideas.filter((i) => i.id !== id) }));
  const startEdit = (i) => { setEditingId(i.id); setEditDraft({ ...i }); };
  const saveEdit = () => {
    mutate((d) => ({ ...d, ideas: d.ideas.map((i) => (i.id === editDraft.id ? editDraft : i)) }));
    setEditingId(null); setEditDraft(null);
  };

  const filtered = subTab === "所有" ? data.ideas : data.ideas.filter((i) => i.tag === subTab);

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-6">
        {[...CONTENT_TAGS, "所有"].map((t) => (
          <PillButton key={t} active={subTab === t} onClick={() => setSubTab(t)} color={COLORS.content} soft={COLORS.contentSoft}>{t}</PillButton>
        ))}
      </div>

      {subTab === "所有" ? (
        <div className="wb-body text-xs mb-6 rounded-sm border border-dashed p-3" style={{ color: COLORS.inkSoft, borderColor: COLORS.line }}>
          "所有"只用来浏览 — 切换到具体分类才能记新想法
        </div>
      ) : (
        <div className="space-y-2 mb-6">
          <SectionLabel color={COLORS.content}>记一个{subTab}想法</SectionLabel>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="标题"
            className="wb-body w-full px-3 py-2 text-sm rounded-sm border bg-transparent outline-none" style={{ borderColor: COLORS.line, color: COLORS.ink }} />
          <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="内容（可选）" rows={3}
            className="wb-body w-full px-3 py-2 text-sm rounded-sm border bg-transparent outline-none resize-none" style={{ borderColor: COLORS.line, color: COLORS.ink }} />
          <textarea value={appendix} onChange={(e) => setAppendix(e.target.value)} placeholder="附注 / appendix（可选）" rows={2}
            className="wb-body w-full px-3 py-2 text-sm rounded-sm border bg-transparent outline-none resize-none" style={{ borderColor: COLORS.line, color: COLORS.ink }} />
          <PrimaryButton onClick={add} color={COLORS.content} icon={Plus}>记下来</PrimaryButton>
        </div>
      )}

      <SectionLabel color={COLORS.content}>{subTab}（{filtered.length}）</SectionLabel>
      {filtered.length === 0 ? <EmptyState text="这里还没有想法" /> : (
        <div className="space-y-2">
          {filtered.map((i) => (
            <div key={i.id} className="rounded-sm border p-3" style={{ borderColor: COLORS.line }}>
              {editingId === i.id ? (
                <div className="space-y-2">
                  <input value={editDraft.title} onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                    className="wb-body w-full px-3 py-2 text-sm rounded-sm border bg-transparent outline-none" style={{ borderColor: COLORS.line, color: COLORS.ink }} />
                  <textarea value={editDraft.content} onChange={(e) => setEditDraft({ ...editDraft, content: e.target.value })} rows={3}
                    className="wb-body w-full px-3 py-2 text-sm rounded-sm border bg-transparent outline-none resize-none" style={{ borderColor: COLORS.line, color: COLORS.ink }} />
                  <textarea value={editDraft.appendix} onChange={(e) => setEditDraft({ ...editDraft, appendix: e.target.value })} rows={2}
                    className="wb-body w-full px-3 py-2 text-sm rounded-sm border bg-transparent outline-none resize-none" style={{ borderColor: COLORS.line, color: COLORS.ink }} />
                  <div className="flex gap-2">
                    <PrimaryButton onClick={saveEdit} color={COLORS.content}>保存</PrimaryButton>
                    <button onClick={() => { setEditingId(null); setEditDraft(null); }} className="wb-mono text-xs px-3" style={{ color: COLORS.inkSoft }}>取消</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="wb-mono text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: COLORS.contentSoft, color: COLORS.content }}>{i.tag}</span>
                      <div className="wb-display text-base" style={{ color: COLORS.ink }}>{i.title}</div>
                    </div>
                    {i.content && <div className="wb-body text-sm mt-1" style={{ color: COLORS.ink }}>{i.content}</div>}
                    {i.appendix && <div className="wb-mono text-xs mt-1" style={{ color: COLORS.inkSoft }}>{i.appendix}</div>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => startEdit(i)} className="wb-mono text-xs px-2 py-1" style={{ color: COLORS.inkSoft }}>更改</button>
                    <button onClick={() => remove(i.id)} className="p-1 opacity-60 hover:opacity-100"><Trash2 size={14} color={COLORS.inkSoft} /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- 待办事项: capture + edit / complete / delete ----------
function TodoTab({ data, mutate }) {
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  const add = () => {
    if (!text.trim()) return;
    mutate((d) => ({ ...d, todoEntries: [{ id: uid(), text: text.trim(), createdAt: Date.now(), done: false }, ...d.todoEntries] }));
    setText("");
  };
  const onKeyDown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); add(); } };
  const remove = (id) => mutate((d) => ({ ...d, todoEntries: d.todoEntries.filter((b) => b.id !== id) }));
  const toggleDone = (id) => mutate((d) => ({ ...d, todoEntries: d.todoEntries.map((b) => (b.id === id ? { ...b, done: !b.done } : b)) }));
  const startEdit = (b) => { setEditingId(b.id); setEditText(b.text); };
  const saveEdit = (id) => {
    mutate((d) => ({ ...d, todoEntries: d.todoEntries.map((b) => (b.id === id ? { ...b, text: editText.trim() || b.text } : b)) }));
    setEditingId(null); setEditText("");
  };

  return (
    <div>
      <SectionLabel color={COLORS.daily}>记一条待办</SectionLabel>
      <div className="mb-6">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown}
          placeholder="要做的事情… 敲回车"
          className="wb-body w-full px-3 py-2 text-sm rounded-sm border bg-transparent outline-none" style={{ borderColor: COLORS.line, color: COLORS.ink }} />
      </div>
      <SectionLabel color={COLORS.daily}>记录（{data.todoEntries.length}）</SectionLabel>
      {data.todoEntries.length === 0 ? <EmptyState text="还是空的 — 上面敲一条试试" /> : (
        <div className="space-y-2">
          {data.todoEntries.map((b) => (
            <div key={b.id} className="rounded-sm border p-3" style={{ borderColor: COLORS.line }}>
              {editingId === b.id ? (
                <div className="flex gap-2">
                  <input value={editText} onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveEdit(b.id); }}
                    className="wb-body flex-1 px-3 py-2 text-sm rounded-sm border bg-transparent outline-none" style={{ borderColor: COLORS.line, color: COLORS.ink }} autoFocus />
                  <PrimaryButton onClick={() => saveEdit(b.id)} color={COLORS.daily}>保存</PrimaryButton>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <div className="wb-body text-sm" style={{ color: b.done ? COLORS.inkSoft : COLORS.ink, textDecoration: b.done ? "line-through" : "none" }}>{b.text}</div>
                    <div className="wb-mono text-xs mt-1" style={{ color: COLORS.inkSoft }}>{fmtTime(b.createdAt)}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => startEdit(b)} className="wb-mono text-xs px-2 py-1" style={{ color: COLORS.inkSoft }}>更改</button>
                    <button onClick={() => toggleDone(b.id)} className="wb-mono text-xs px-2 py-1" style={{ color: b.done ? COLORS.coaching : COLORS.inkSoft }}>{b.done ? "已完成" : "完成"}</button>
                    <button onClick={() => remove(b.id)} className="p-1.5 opacity-60 hover:opacity-100"><Trash2 size={14} color={COLORS.inkSoft} /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- 潘多拉魔盒: independent free-form capture + creative reflection ----------
function PandoraTab({ data, mutate }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const add = () => {
    if (!text.trim()) return;
    mutate((d) => ({ ...d, pandoraEntries: [{ id: uid(), text: text.trim(), createdAt: Date.now() }, ...d.pandoraEntries] }));
    setText("");
  };
  const onKeyDown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); add(); } };
  const remove = (id) => mutate((d) => ({ ...d, pandoraEntries: d.pandoraEntries.filter((b) => b.id !== id) }));

  const reflect = async () => {
    setError(""); setBusy(true);
    try {
      const list = data.pandoraEntries.map((b) => `- ${b.text}`).join("\n") || "（暂无记录）";
      const result = await callClaude(
        "你是一个善于从零碎念头里发现有趣东西的伙伴。请始终用中文回复，语气轻松、有洞察，不要写成待办清单，也不要泛泛而谈。",
        `这是我随手记下的一堆天马行空的念头：\n\n${list}\n\n不用整理成待办事项。请聊一聊：\n1. 这些念头里有意思的部分是什么\n2. 从中能看出我身上什么样的特质，未来可以往哪个方向延展\n3. 顺带丢给我一些不一定有用但挺有意思的知识拓展`,
        1500
      );
      mutate((d) => ({ ...d, boxReflection: { text: result, generatedAt: Date.now() } }));
    } catch (e) { setError(e.message || "生成失败，请重试"); } finally { setBusy(false); }
  };

  return (
    <div>
      <SectionLabel color={COLORS.progress}>扔进来</SectionLabel>
      <div className="mb-6">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown}
          placeholder="天马行空的想象力，什么都行… 敲回车"
          className="wb-body w-full px-3 py-2 text-sm rounded-sm border bg-transparent outline-none" style={{ borderColor: COLORS.line, color: COLORS.ink }} />
      </div>

      <SectionLabel color={COLORS.progress}>记录（{data.pandoraEntries.length}）</SectionLabel>
      {data.pandoraEntries.length === 0 ? <EmptyState text="还是空的 — 上面敲一条试试" /> : (
        <div className="space-y-2 mb-6">
          {data.pandoraEntries.map((b) => (
            <div key={b.id} className="flex items-start gap-2 rounded-sm border p-3" style={{ borderColor: COLORS.line }}>
              <div className="flex-1">
                <div className="wb-body text-sm" style={{ color: COLORS.ink }}>{b.text}</div>
                <div className="wb-mono text-xs mt-1" style={{ color: COLORS.inkSoft }}>{fmtTime(b.createdAt)}</div>
              </div>
              <button onClick={() => remove(b.id)} className="p-1 opacity-60 hover:opacity-100 shrink-0"><Trash2 size={14} color={COLORS.inkSoft} /></button>
            </div>
          ))}
        </div>
      )}

      <SectionLabel color={COLORS.progress}>整理脑洞</SectionLabel>
      <div className="mb-6">
        <PrimaryButton onClick={reflect} disabled={busy || data.pandoraEntries.length === 0} color={COLORS.progress} icon={Wand2}>
          整理脑洞
        </PrimaryButton>
        {error && <div className="wb-body text-sm mt-3" style={{ color: COLORS.daily }}>{error}</div>}
        {data.boxReflection && (
          <div className="wb-body text-sm whitespace-pre-wrap rounded-sm p-3 mt-3" style={{ backgroundColor: COLORS.progressSoft, color: COLORS.ink }}>
            {data.boxReflection.text}
          </div>
        )}
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
          <div className="wb-mono text-xs mt-1" style={{ color: COLORS.inkSoft }}>coaching · content · todo · pandora</div>
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
              {active === "box" && <TodoTab data={data} mutate={mutate} />}
              {active === "guide" && <PandoraTab data={data} mutate={mutate} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
