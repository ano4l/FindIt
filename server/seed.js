// Loads the sample locators and apartment listings into an empty database: `pnpm db:seed`.
// Everything it adds is labelled "Sample data". It does nothing if listings already exist.
import { migrate, seedLocators, seedProperties } from "./db.js";
import { openScriptDb } from "./cli.js";

const db = await openScriptDb();
await migrate(db);
console.log(`Sample locators added: ${await seedLocators(db)}`);
console.log(`Sample listings added: ${await seedProperties(db)}`);
await db.close();
