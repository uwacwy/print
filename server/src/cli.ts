import { loadConfig } from "./config/config.js";
import { getPrinterInfo } from "./cli/get-printer-info.js";
import {
  createPrinter,
  getPrinterBySlug,
  listPrinters,
  openDatabase,
  rotatePrinterToken,
  validatePrinterFields,
} from "./database/database.js";

const [command, ...args] = process.argv.slice(2);

function usage(): never {
  console.error(
    "Usage: print-admin printer:add <slug> <name> <cups-or-ipp-uri> [--cover-page] | printer:list | printer:rotate-token <slug> | printer:get-info <ipp-uri-or-host>",
  );
  process.exit(2);
}

try {
  if (command === "printer:get-info") {
    if (args.length !== 1 || !args[0]) usage();
    console.log(JSON.stringify(await getPrinterInfo(args[0]), null, 2));
  } else {
    const { db } = openDatabase(loadConfig().dataDir);
    try {
      if (command === "printer:add") {
        const [slug, name, queue] = args.filter((arg) => !arg.startsWith("--"));
        const fields = validatePrinterFields({
          slug,
          name,
          queue,
          cover_page: args.includes("--cover-page"),
        });
        if (typeof fields === "string") throw new Error(fields);
        const created = createPrinter(db, fields);
        if (typeof created === "string") throw new Error(created);
        console.log(
          `Printer ${fields.slug} registered. Store this token on its print agent; it will not be shown again:\n${created.token}`,
        );
      } else if (command === "printer:list") {
        for (const printer of listPrinters(db)) {
          console.log(
            `${printer.slug}\t${printer.name}\tdestination=${printer.queue}\tcover_page=${printer.cover_page === 1 ? "yes" : "no"}\tlast_seen=${printer.last_seen_at ?? "never"}`,
          );
        }
      } else if (command === "printer:rotate-token") {
        const [slug] = args;
        if (!slug) usage();
        const printer = getPrinterBySlug(db, slug);
        const token = printer && rotatePrinterToken(db, printer.id);
        if (!token) throw new Error(`Unknown printer: ${slug}`);
        console.log(
          `Token rotated for ${slug}. Update its print agent:\n${token}`,
        );
      } else {
        usage();
      }
    } finally {
      db.close();
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
