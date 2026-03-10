import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { deriveProjects } from '../src/lib/evoia-meta/derive';
import { applyOverrides, parseWorkbookRows } from '../src/lib/evoia-meta/parse';
import { buildEvoiaMetaSummary } from '../src/lib/evoia-meta/selectors';
import {
  evoiaMetaOverridesSchema,
  evoiaMetaProjectSchema,
  evoiaMetaSummarySchema,
  type EvoiaMetaOverrides,
  type EvoiaMetaProject
} from '../src/lib/evoia-meta/schema';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const overridesPath = join(repoRoot, 'data', 'overrides', 'evoia-meta-overrides.json');
const generatedProjectsPath = join(repoRoot, 'data', 'generated', 'evoia-meta-projects.json');
const generatedSummaryPath = join(repoRoot, 'data', 'generated', 'evoia-meta-summary.json');
const sheetName = 'Works_EN';
const workbookCandidates = [
  join(repoRoot, 'data', 'raw', 'EviaMeta_Works_update02.xlsx'),
  join(repoRoot, 'data', 'raw', 'EviaMeta_Works_update01.xlsx'),
  join(repoRoot, 'data', 'raw', 'EviaMeta_Works.xlsx')
] as const;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseTodayArgument(): string {
  const todayArgument = process.argv.find((argument) => argument.startsWith('--today='));
  const todayValue = todayArgument ? todayArgument.slice('--today='.length) : process.env.EVOIA_META_TODAY;

  if (!todayValue) {
    return new Date().toISOString().slice(0, 10);
  }
  if (!ISO_DATE_PATTERN.test(todayValue)) {
    throw new Error(`Invalid today value "${todayValue}". Use YYYY-MM-DD.`);
  }

  return todayValue;
}

function parseWorkbookPathArgument(): string | null {
  const workbookArgument = process.argv.find((argument) => argument.startsWith('--workbook='));
  const workbookValue = workbookArgument
    ? workbookArgument.slice('--workbook='.length)
    : process.env.EVOIA_META_WORKBOOK ?? null;

  if (!workbookValue || workbookValue.trim().length === 0) {
    return null;
  }

  return workbookValue.trim();
}

function resolveWorkbookPath(): string {
  const overridePath = parseWorkbookPathArgument();
  if (overridePath) {
    const absoluteOverridePath = isAbsolute(overridePath) ? overridePath : join(repoRoot, overridePath);
    if (!existsSync(absoluteOverridePath)) {
      throw new Error(`Workbook not found: ${relative(repoRoot, absoluteOverridePath)}`);
    }
    return absoluteOverridePath;
  }

  const firstExistingWorkbook = workbookCandidates.find((candidate) => existsSync(candidate));
  if (!firstExistingWorkbook) {
    const searched = workbookCandidates.map((candidate) => relative(repoRoot, candidate)).join(', ');
    throw new Error(`Workbook not found. Searched: ${searched}`);
  }

  return firstExistingWorkbook;
}

function ensureOutputDirectory(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function writeJson(path: string, value: unknown): void {
  ensureOutputDirectory(path);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readWorkbookRows(workbookPath: string): Array<Record<string, unknown>> {
  if (!existsSync(workbookPath)) {
    throw new Error(`Workbook not found: ${relative(repoRoot, workbookPath)}`);
  }

  const workbook = XLSX.readFile(workbookPath);
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`Worksheet "${sheetName}" not found in ${relative(repoRoot, workbookPath)}.`);
  }

  return XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: null,
    raw: false
  });
}

function readOverrides(): EvoiaMetaOverrides {
  if (!existsSync(overridesPath)) {
    return {
      projects: {}
    };
  }

  const source = readFileSync(overridesPath, 'utf8').trim();
  if (source.length === 0) {
    return {
      projects: {}
    };
  }

  const parsed = JSON.parse(source) as unknown;
  return evoiaMetaOverridesSchema.parse(parsed);
}

function validateProjects(projects: EvoiaMetaProject[]): EvoiaMetaProject[] {
  return projects.map((project) => evoiaMetaProjectSchema.parse(project));
}

function main(): void {
  const todayISO = parseTodayArgument();
  const workbookPath = resolveWorkbookPath();
  const rawRows = readWorkbookRows(workbookPath);
  const overrides = readOverrides();

  const parsed = parseWorkbookRows(rawRows);
  const overridden = applyOverrides(parsed.projects, overrides);
  const derived = deriveProjects(overridden.projects, todayISO);

  const projects = validateProjects(derived.projects);
  const warnings = Array.from(new Set([...parsed.warnings, ...overridden.warnings, ...derived.warnings]));
  const summary = evoiaMetaSummarySchema.parse(buildEvoiaMetaSummary(projects, warnings, todayISO));

  writeJson(generatedProjectsPath, projects);
  writeJson(generatedSummaryPath, summary);

  console.log(`[evoia-meta] workbook: ${relative(repoRoot, workbookPath)}`);
  console.log(`[evoia-meta] sheet: ${sheetName}`);
  console.log(`[evoia-meta] projects parsed: ${projects.length}`);
  console.log(`[evoia-meta] warnings: ${warnings.length}`);
  console.log(`[evoia-meta] wrote ${relative(repoRoot, generatedProjectsPath)}`);
  console.log(`[evoia-meta] wrote ${relative(repoRoot, generatedSummaryPath)}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[evoia-meta] ingestion failed: ${message}`);
  process.exit(1);
}
