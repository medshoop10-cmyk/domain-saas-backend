import { ingestDomains } from "../jobs/domainIngestion";

const count = parseInt(process.argv[2] || "500", 10);

ingestDomains(count)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("Ingestion failed:", err);
    process.exit(1);
  });
