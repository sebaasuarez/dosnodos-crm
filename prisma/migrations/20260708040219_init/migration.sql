-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'COMERCIAL', 'MARKETING', 'LECTURA');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NUEVO', 'ENRIQUECIDO', 'CALIFICADO', 'PENDIENTE_CONSENTIMIENTO', 'CONTACTO_PERMITIDO', 'PRIMER_CONTACTO', 'RESPONDIO', 'CONVERSACION_ACTIVA', 'INTERESADO', 'DIAGNOSTICO_ENVIADO', 'REUNION_AGENDADA', 'PROPUESTA_ENVIADA', 'NEGOCIACION', 'GANADO', 'PERDIDO', 'NO_CONTACTAR', 'OPT_OUT');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('SIN_CONSENTIMIENTO', 'PENDIENTE', 'OPT_IN', 'OPT_OUT');

-- CreateEnum
CREATE TYPE "LeadSourceType" AS ENUM ('APIFY_GOOGLE_MAPS', 'LANDING_FORM', 'CLICK_TO_WHATSAPP', 'WHATSAPP_INBOUND', 'QR', 'ANUNCIO', 'REFERIDO', 'MANUAL');

-- CreateEnum
CREATE TYPE "ConsentEventType" AS ENUM ('OPT_IN', 'OPT_OUT', 'NO_CONTACTAR');

-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('CAPTACION_OPT_IN', 'SEGUIMIENTO', 'REACTIVACION', 'POR_SERVICIO');

-- CreateEnum
CREATE TYPE "CampaignChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'LANDING', 'QR', 'ANUNCIO');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('BORRADOR', 'ACTIVA', 'PAUSADA', 'FINALIZADA');

-- CreateEnum
CREATE TYPE "RecipientStatus" AS ENUM ('PENDIENTE', 'PROGRAMADO', 'ENVIADO', 'RESPONDIO', 'BLOQUEADO', 'OPT_OUT', 'ERROR');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ABIERTA', 'PENDIENTE_HUMANO', 'CERRADA');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('ENTRANTE', 'SALIENTE');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDIENTE', 'ENVIADO', 'ENTREGADO', 'LEIDO', 'FALLIDO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('BORRADOR', 'PENDIENTE_APROBACION', 'APROBADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "OpportunityStage" AS ENUM ('DIAGNOSTICO', 'PROPUESTA', 'NEGOCIACION', 'GANADA', 'PERDIDA');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('AGENDADA', 'CONFIRMADA', 'REALIZADA', 'NO_ASISTIO', 'CANCELADA');

-- CreateEnum
CREATE TYPE "ApifyRunStatus" AS ENUM ('EN_EJECUCION', 'COMPLETADO', 'FALLIDO');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'COMERCIAL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Colombia',
    "category" TEXT,
    "source" "LeadSourceType" NOT NULL DEFAULT 'MANUAL',
    "sourceUrl" TEXT,
    "sourceDetail" TEXT,
    "googleMapsUrl" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewsCount" INTEGER,
    "openingHours" TEXT,
    "socialMedia" JSONB,
    "hasWebsite" BOOLEAN NOT NULL DEFAULT false,
    "hasWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "hasEmail" BOOLEAN NOT NULL DEFAULT false,
    "hasSocialMedia" BOOLEAN NOT NULL DEFAULT false,
    "digitalOpportunitySummary" TEXT,
    "recommendedService" TEXT,
    "recommendedPackage" TEXT,
    "aiObservations" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "scoreBreakdown" JSONB,
    "status" "LeadStatus" NOT NULL DEFAULT 'NUEVO',
    "consentStatus" "ConsentStatus" NOT NULL DEFAULT 'SIN_CONSENTIMIENTO',
    "optInDate" TIMESTAMP(3),
    "optOutDate" TIMESTAMP(3),
    "enrichedAt" TIMESTAMP(3),
    "lastInteraction" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "nextStep" TEXT,
    "lostReason" TEXT,
    "assignedToId" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_scores" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_events" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" "ConsentEventType" NOT NULL,
    "channel" TEXT NOT NULL,
    "source" TEXT,
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CampaignType" NOT NULL,
    "channel" "CampaignChannel" NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'BORRADOR',
    "audienceFilter" JSONB,
    "dailyLimit" INTEGER NOT NULL DEFAULT 20,
    "hourlyLimit" INTEGER NOT NULL DEFAULT 5,
    "allowedHoursStart" INTEGER NOT NULL DEFAULT 8,
    "allowedHoursEnd" INTEGER NOT NULL DEFAULT 19,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "templateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" "RecipientStatus" NOT NULL DEFAULT 'PENDIENTE',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "blockedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "kapsoConversationId" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'ABIERTA',
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastMessageAt" TIMESTAMP(3),
    "lastInboundAt" TIMESTAMP(3),
    "assignedToId" TEXT,
    "aiSummary" TEXT,
    "nextAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "leadId" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "content" TEXT NOT NULL,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "templateName" TEXT,
    "providerMessageId" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'PENDIENTE',
    "detectedIntent" TEXT,
    "sentByAi" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'es',
    "category" TEXT NOT NULL DEFAULT 'MARKETING',
    "body" TEXT NOT NULL,
    "variables" JSONB,
    "status" "TemplateStatus" NOT NULL DEFAULT 'BORRADOR',
    "kapsoTemplateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "packageName" TEXT,
    "estimatedValue" INTEGER NOT NULL DEFAULT 0,
    "stage" "OpportunityStage" NOT NULL DEFAULT 'DIAGNOSTICO',
    "probability" INTEGER NOT NULL DEFAULT 30,
    "expectedCloseDate" TIMESTAMP(3),
    "notes" TEXT,
    "lostReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDIENTE',
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "authorId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 15,
    "status" "MeetingStatus" NOT NULL DEFAULT 'AGENDADA',
    "googleEventId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apify_runs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "runId" TEXT,
    "status" "ApifyRunStatus" NOT NULL DEFAULT 'EN_EJECUCION',
    "input" JSONB NOT NULL,
    "totalResults" INTEGER NOT NULL DEFAULT 0,
    "newLeads" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "apify_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "actor" TEXT NOT NULL DEFAULT 'system',
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "detail" JSONB,
    "level" TEXT NOT NULL DEFAULT 'info',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "service_packages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT,
    "features" JSONB NOT NULL,
    "idealFor" TEXT,
    "priceMinCop" INTEGER,
    "priceMaxCop" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_packages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "leads_googleMapsUrl_key" ON "leads"("googleMapsUrl");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_consentStatus_idx" ON "leads"("consentStatus");

-- CreateIndex
CREATE INDEX "leads_score_idx" ON "leads"("score");

-- CreateIndex
CREATE INDEX "leads_city_category_idx" ON "leads"("city", "category");

-- CreateIndex
CREATE INDEX "leads_phone_idx" ON "leads"("phone");

-- CreateIndex
CREATE INDEX "leads_createdAt_idx" ON "leads"("createdAt");

-- CreateIndex
CREATE INDEX "lead_scores_leadId_idx" ON "lead_scores"("leadId");

-- CreateIndex
CREATE INDEX "consent_events_leadId_idx" ON "consent_events"("leadId");

-- CreateIndex
CREATE INDEX "consent_events_type_idx" ON "consent_events"("type");

-- CreateIndex
CREATE INDEX "campaign_recipients_status_idx" ON "campaign_recipients"("status");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_campaignId_leadId_key" ON "campaign_recipients"("campaignId", "leadId");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_kapsoConversationId_key" ON "conversations"("kapsoConversationId");

-- CreateIndex
CREATE INDEX "conversations_leadId_idx" ON "conversations"("leadId");

-- CreateIndex
CREATE INDEX "conversations_status_idx" ON "conversations"("status");

-- CreateIndex
CREATE INDEX "conversations_lastMessageAt_idx" ON "conversations"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "messages_providerMessageId_key" ON "messages"("providerMessageId");

-- CreateIndex
CREATE INDEX "messages_conversationId_idx" ON "messages"("conversationId");

-- CreateIndex
CREATE INDEX "messages_direction_createdAt_idx" ON "messages"("direction", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_templates_name_key" ON "whatsapp_templates"("name");

-- CreateIndex
CREATE INDEX "opportunities_stage_idx" ON "opportunities"("stage");

-- CreateIndex
CREATE INDEX "tasks_status_dueDate_idx" ON "tasks"("status", "dueDate");

-- CreateIndex
CREATE INDEX "notes_leadId_idx" ON "notes"("leadId");

-- CreateIndex
CREATE INDEX "meetings_scheduledAt_idx" ON "meetings"("scheduledAt");

-- CreateIndex
CREATE INDEX "apify_runs_startedAt_idx" ON "apify_runs"("startedAt");

-- CreateIndex
CREATE INDEX "automation_logs_createdAt_idx" ON "automation_logs"("createdAt");

-- CreateIndex
CREATE INDEX "automation_logs_action_idx" ON "automation_logs"("action");

-- CreateIndex
CREATE UNIQUE INDEX "service_packages_name_key" ON "service_packages"("name");

-- AddForeignKey
ALTER TABLE "lead_scores" ADD CONSTRAINT "lead_scores_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "whatsapp_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_logs" ADD CONSTRAINT "automation_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
