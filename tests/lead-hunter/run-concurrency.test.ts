import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { runLeadHunter } from "@/lib/lead-hunter/run";

const LOCK_TEST_BATCH_LABEL = "test-concurrency-lock";

afterEach(async () => {
  await db.leadHunterExecution.deleteMany({ where: { batchLabel: LOCK_TEST_BATCH_LABEL } });
});

describe("runLeadHunter — candado de concurrencia", () => {
  it("no inicia una ejecución nueva si ya hay una RUNNING reciente", async () => {
    const existing = await db.leadHunterExecution.create({
      data: { status: "RUNNING", triggerType: "CRON", batchLabel: LOCK_TEST_BATCH_LABEL },
    });

    const outcome = await runLeadHunter("MANUAL");

    expect(outcome.alreadyRunning).toBe(true);
    expect(outcome.executionId).toBe(existing.id);

    const count = await db.leadHunterExecution.count({ where: { batchLabel: LOCK_TEST_BATCH_LABEL } });
    expect(count).toBe(1); // no se creó ninguna ejecución adicional
  });

  it("una ejecución RUNNING huérfana (vieja) se marca FAILED y no bloquea una corrida nueva", async () => {
    const stale = await db.leadHunterExecution.create({
      data: {
        status: "RUNNING",
        triggerType: "CRON",
        batchLabel: LOCK_TEST_BATCH_LABEL,
        startedAt: new Date(Date.now() - 20 * 60 * 1000), // 20 min > umbral de 10 min
      },
    });

    const outcome = await runLeadHunter("MANUAL");
    try {
      expect(outcome.alreadyRunning).toBe(false);
      expect(outcome.executionId).not.toBe(stale.id);

      const staleReloaded = await db.leadHunterExecution.findUniqueOrThrow({ where: { id: stale.id } });
      expect(staleReloaded.status).toBe("FAILED");
    } finally {
      // La ejecución real creada por runLeadHunter no usa LOCK_TEST_BATCH_LABEL
      // (usa el batchLabel real del día) — se limpia aparte.
      await db.lead.deleteMany({ where: { leadHunterExecutionId: outcome.executionId } });
      await db.leadHunterExecution.deleteMany({ where: { id: outcome.executionId } });
    }
  });
});
