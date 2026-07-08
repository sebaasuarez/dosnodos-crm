import Link from "next/link";
import { db } from "@/lib/db";
import { formatDateTime, consentColor, CONSENT_LABELS, scoreColor } from "@/lib/format";
import { AiToggle } from "@/components/client-actions";
import { MessageComposer } from "@/components/forms";

export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; filter?: string }>;
}) {
  const params = await searchParams;
  const conversations = await db.conversation.findMany({
    where: params.filter === "humano" ? { status: "PENDIENTE_HUMANO" } : { status: { not: "CERRADA" } },
    orderBy: { lastMessageAt: "desc" },
    take: 60,
    include: {
      lead: { select: { id: true, companyName: true, contactName: true, phone: true, score: true, consentStatus: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const selectedId = params.c ?? conversations[0]?.id;
  const selected = selectedId
    ? await db.conversation.findUnique({
        where: { id: selectedId },
        include: {
          lead: true,
          messages: { orderBy: { createdAt: "asc" } },
        },
      })
    : null;

  return (
    <div className="flex h-full flex-col space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">WhatsApp Inbox</h1>
          <p className="text-sm text-slate-500">{conversations.length} conversaciones abiertas</p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href="/inbox" className={`btn-secondary text-xs ${!params.filter ? "border-brand-500 text-brand-700" : ""}`}>
            Todas
          </Link>
          <Link href="/inbox?filter=humano" className={`btn-secondary text-xs ${params.filter === "humano" ? "border-brand-500 text-brand-700" : ""}`}>
            Esperando humano
          </Link>
        </div>
      </header>

      <div className="grid flex-1 gap-4 overflow-hidden lg:grid-cols-[320px_1fr]">
        {/* Lista de conversaciones */}
        <div className="card overflow-y-auto">
          {conversations.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-400">
              Sin conversaciones. Llegarán aquí cuando alguien escriba por WhatsApp (webhook de Kapso).
            </p>
          )}
          <ul className="divide-y divide-slate-100">
            {conversations.map((conv) => (
              <li key={conv.id}>
                <Link
                  href={`/inbox?c=${conv.id}${params.filter ? `&filter=${params.filter}` : ""}`}
                  className={`block px-4 py-3 transition hover:bg-slate-50 ${
                    conv.id === selectedId ? "bg-brand-50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{conv.lead.companyName}</p>
                    <span className={`badge shrink-0 ${scoreColor(conv.lead.score)}`}>{conv.lead.score}</span>
                  </div>
                  <p className="truncate text-xs text-slate-500">
                    {conv.messages[0]?.content ?? "Sin mensajes"}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                    <span>{formatDateTime(conv.lastMessageAt)}</span>
                    {conv.status === "PENDIENTE_HUMANO" && (
                      <span className="badge bg-amber-100 text-amber-800">Esperando humano</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Detalle de conversación */}
        {selected ? (
          <div className="card flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <Link href={`/leads/${selected.lead.id}`} className="text-sm font-semibold hover:text-brand-600">
                  {selected.lead.companyName}
                </Link>
                <p className="text-xs text-slate-500">
                  {selected.lead.phone} ·{" "}
                  <span className={`badge ${consentColor(selected.lead.consentStatus)}`}>
                    {CONSENT_LABELS[selected.lead.consentStatus]}
                  </span>
                </p>
              </div>
              <AiToggle conversationId={selected.id} aiEnabled={selected.aiEnabled} />
            </div>

            {selected.aiSummary && (
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600">
                <p className="font-semibold">Resumen IA:</p>
                <p className="whitespace-pre-line">{selected.aiSummary}</p>
              </div>
            )}

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {selected.messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                    message.direction === "ENTRANTE"
                      ? "bg-slate-100 text-slate-800"
                      : message.status === "BLOQUEADO"
                        ? "ml-auto border border-red-200 bg-red-50 text-red-800"
                        : "ml-auto bg-brand-600 text-white"
                  }`}
                >
                  <p className="whitespace-pre-line">{message.content}</p>
                  <p className={`mt-1 text-[10px] ${message.direction === "ENTRANTE" ? "text-slate-400" : message.status === "BLOQUEADO" ? "text-red-500" : "text-brand-200"}`}>
                    {formatDateTime(message.createdAt)}
                    {message.sentByAi && " · IA"}
                    {message.status === "BLOQUEADO" && ` · BLOQUEADO: ${message.failedReason}`}
                    {message.detectedIntent && message.direction === "ENTRANTE" && ` · ${message.detectedIntent}`}
                  </p>
                </div>
              ))}
              {selected.messages.length === 0 && (
                <p className="text-center text-sm text-slate-400">Sin mensajes en esta conversación.</p>
              )}
            </div>

            <div className="border-t border-slate-200 p-3">
              {selected.nextAction && (
                <p className="mb-2 text-xs text-amber-700">💡 {selected.nextAction}</p>
              )}
              <MessageComposer conversationId={selected.id} />
            </div>
          </div>
        ) : (
          <div className="card flex items-center justify-center text-sm text-slate-400">
            Selecciona una conversación
          </div>
        )}
      </div>
    </div>
  );
}
