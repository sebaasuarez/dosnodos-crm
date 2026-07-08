/**
 * Ejecuta un job desde la CLI: npm run job -- lead-discovery
 * Útil para pruebas locales y para crontab en servidores propios.
 */
import { runJob, JOB_NAMES, type JobName } from "../src/lib/jobs";

const name = process.argv[2] as JobName | undefined;

if (!name || !JOB_NAMES.includes(name)) {
  console.error(`Uso: npm run job -- <job>\nJobs disponibles: ${JOB_NAMES.join(", ")}`);
  process.exit(1);
}

runJob(name)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
