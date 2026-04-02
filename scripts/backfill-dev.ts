import { db } from "../server/db";
import { aiEmployees, aiCompanies } from "../shared/schema";
import { eq } from "drizzle-orm";

async function addDevAgent() {
  const allCompanies = await db.select().from(aiCompanies);
  if (allCompanies.length === 0) {
    console.log("No boardroom initialized yet.");
    process.exit(0);
  }

  for (const company of allCompanies) {
    const existingEmployees = await db.select().from(aiEmployees).where(eq(aiEmployees.companyId, company.id));
    const hasDev = existingEmployees.some((e) => e.role === "DEV");

    if (!hasDev) {
      await db.insert(aiEmployees).values({
        companyId: company.id,
        role: "DEV",
        name: "Ada",
        personality: "Full Stack AI Developer. Speaks in Markdown. Turns CTO architecture into pull requests. Obsessed with clean, type-safe code.",
        status: "active",
      });
      console.log(`Hired Ada (DEV) for company: ${company.name}`);
    } else {
      console.log(`Company ${company.name} already has a DEV.`);
    }
  }

  console.log("Migration complete.");
  process.exit(0);
}

addDevAgent().catch((e) => {
  console.error("Failed to add Dev agent:", e);
  process.exit(1);
});
