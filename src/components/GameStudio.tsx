"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { translateApiError, type MessageKey } from "@/lib/i18n";

export type StudioMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type Game = {
  id: string;
  title: string;
  status: "draft" | "published";
  publicSlug: string;
  draftRevision: number;
  publishedRevision: number | null;
};

type StreamEvent =
  | { type: "activity"; message: string }
  | { type: "files"; paths: string[] }
  | { type: "assistant"; message: string }
  | { type: "revision"; revision: number }
  | { type: "error"; message: string }
  | { type: "session" | "done" };

export function GameStudio({ game: initialGame, initialMessages }: { game: Game; initialMessages: StudioMessage[] }) {
  const { locale, t } = useI18n();
  const [game, setGame] = useState(initialGame);
  const [messages, setMessages] = useState(initialMessages);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewUrl = useMemo(() => `/api/games/${game.id}/preview?revision=${game.draftRevision}`, [game.id, game.draftRevision]);

  function localizeActivity(activity: string) {
    const keys: Record<string, MessageKey> = {
      "Building and checking the game": "studio.activity.building",
      "Designing the next change": "studio.activity.designing",
      "Waiting for an available coding slot": "studio.activity.waiting",
      "Codex is working": "studio.activity.working",
      "Repairing validation problems": "studio.activity.repairing",
    };
    return keys[activity] ? t(keys[activity]) : activity;
  }

  function handleStreamEvent(event: StreamEvent, assistant: { value: string }) {
    if (event.type === "activity") setStatus(localizeActivity(event.message));
    if (event.type === "files") setStatus(t("studio.updatedFiles", { files: event.paths.join(", ") }));
    if (event.type === "assistant") assistant.value = event.message;
    if (event.type === "error") throw new Error(event.message);
    if (event.type === "revision") {
      setGame((current) => ({ ...current, draftRevision: event.revision }));
      setStatus(t("studio.updated"));
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text || busy) return;
    setMessage("");
    setBusy(true);
    setError("");
    setStatus(t("studio.starting"));
    const optimistic: StudioMessage = { id: `local-${Date.now()}`, role: "user", content: text, createdAt: new Date().toISOString() };
    setMessages((current) => [...current, optimistic]);
    const assistant = { value: t("studio.success") };

    try {
      const response = await fetch(`/api/games/${game.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(translateApiError(locale, body.error, t("studio.startError")));
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const data = chunk.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
          if (data) handleStreamEvent(JSON.parse(data) as StreamEvent, assistant);
        }
        if (done) break;
      }
      setMessages((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: assistant.value,
        createdAt: new Date().toISOString(),
      }]);
      setTimeout(() => { if (iframeRef.current) iframeRef.current.src = previewUrl.split("?")[0] + `?t=${Date.now()}`; }, 0);
    } catch (caught) {
      setError(caught instanceof Error ? translateApiError(locale, caught.message, t("studio.generationError")) : t("studio.generationError"));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish() {
    setError("");
    const publishing = game.status !== "published";
    const response = await fetch(`/api/games/${game.id}/publish`, { method: publishing ? "POST" : "DELETE" });
    const result = await response.json();
    if (!response.ok) return setError(translateApiError(locale, result.error, t("studio.publishError")));
    setGame((current) => ({
      ...current,
      status: publishing ? "published" : "draft",
      publishedRevision: publishing ? current.draftRevision : current.publishedRevision,
    }));
  }

  return (
    <div className="studio-grid">
      <section className="chat-panel">
        <div className="message-list" aria-live="polite">
          {messages.length === 0 && (
            <div className="chat-intro"><span>✦</span><h2>{t("studio.introTitle")}</h2><p>{t("studio.introText")}</p></div>
          )}
          {messages.map((item) => <div className={`message ${item.role}`} key={item.id}><span>{item.role === "user" ? t("studio.you") : "Forge"}</span><p>{item.content}</p></div>)}
          {busy && <div className="activity"><i /><span>{status || t("studio.working")}</span></div>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <form className="composer" onSubmit={sendMessage}>
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder={t("studio.prompt")} maxLength={12000} disabled={busy} />
          <button className="send-button" disabled={busy || !message.trim()} aria-label={t("studio.send")}>↑</button>
        </form>
      </section>
      <section className="preview-panel">
        <div className="preview-toolbar">
          <div><strong>{t("studio.liveDraft")}</strong><span>{t("studio.revision", { revision: game.draftRevision })}</span></div>
          <div className="preview-actions">
            {game.status === "published" && <a className="secondary-button" href={`/play/${game.publicSlug}`} target="_blank">{t("studio.openPublished")}</a>}
            <button className={game.status === "published" ? "secondary-button" : "primary-button"} onClick={togglePublish}>{t(game.status === "published" ? "common.unpublish" : "common.publish")}</button>
          </div>
        </div>
        <div className="browser-frame">
          <div className="browser-bar"><i /><i /><i /><span>/draft/{game.id.slice(0, 8)}</span></div>
          <iframe ref={iframeRef} title={`${game.title} preview`} src={previewUrl} sandbox="allow-scripts" />
        </div>
      </section>
    </div>
  );
}
