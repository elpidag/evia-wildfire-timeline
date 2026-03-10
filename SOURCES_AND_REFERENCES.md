# Sources and References

## Primary source
- Panorama register: `https://evoia-meta.gov.gr/panorama`
- Workbook used in V1: `EviaMeta_Works.xlsx`
- Sheet used in V1: `Works_EN`

## Official implementation references
- Codex AGENTS.md guide: `https://developers.openai.com/codex/guides/agents-md/`
- Codex advanced configuration: `https://developers.openai.com/codex/config-advanced/`
- Astro islands: `https://docs.astro.build/en/concepts/islands/`
- Astro React integration: `https://docs.astro.build/en/guides/integrations-guide/react/`
- Astro build with AI guidance: `https://docs.astro.build/en/guides/build-with-ai/`
- D3 getting started: `https://d3js.org/getting-started`
- MDN Intersection Observer API: `https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API`
- ExcelJS repository: `https://github.com/exceljs/exceljs`
- TanStack Table docs: `https://tanstack.com/table/latest/docs/introduction`

## Notes for implementation
- Prefer official Astro integration setup over manual config editing.
- Prefer D3 primitives over higher-level chart wrappers for the three main visuals.
- Prefer native IntersectionObserver over extra scroll libraries in V1.
- Use TanStack Table only if a sortable evidence table is needed.
