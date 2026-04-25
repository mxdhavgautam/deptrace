import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Command, CommanderError } from "commander";
import { analyzeDependency } from "./analyze.js";
import { formatHumanReport } from "./format/human.js";
import { formatJsonReport } from "./format/json.js";

type CliOptions = {
  json?: boolean;
  cwd?: string;
};

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version?: string;
};

const program = new Command();

program
  .name("deptrace")
  .description("Explain where a JavaScript or TypeScript dependency is used.")
  .version(packageJson.version ?? "0.0.0")
  .exitOverride()
  .argument("<target>", "dependency package or package subpath to explain")
  .option("--json", "print a stable JSON report")
  .option("--cwd <dir>", "project directory to analyze", process.cwd())
  .action(async (target: string, options: CliOptions) => {
    const report = await analyzeDependency({
      cwd: options.cwd ?? process.cwd(),
      target,
      toolVersion: packageJson.version ?? "0.0.0",
    });

    process.stdout.write(options.json ? formatJsonReport(report) : formatHumanReport(report));
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof CommanderError) {
    process.exitCode = error.exitCode === 0 ? 0 : 2;
  } else {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`deptrace: ${message}\n`);
    process.exitCode = 2;
  }
}

export const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);
