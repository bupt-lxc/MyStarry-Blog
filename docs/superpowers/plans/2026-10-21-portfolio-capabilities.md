# Portfolio Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user explicitly authorized writing the plan and executing it without further approval questions.

**Goal:** Publish a portfolio with three equally weighted capability sections, unique project cards and cross-direction evidence, emphasizing personal contributions and outcomes.

**Architecture:** Extend the existing Astro Markdown project collection with validated capability and card presentation metadata. Pure helpers derive sections and related evidence; small Astro components render overview navigation, sections, outcomes and project cards. A Python standard-library HTML verifier checks the actual static output before CI can package a release. Existing detail routes, theme switching, database and port 8550 remain in place.

**Tech Stack:** Existing Astro 7, TypeScript, Markdown, theme CSS, Node test runner/tsx; Python 3 standard library for output validation; existing GitHub Actions deployment.

**Approved specification:** `docs/superpowers/specs/2026-10-21-portfolio-capabilities-design.md`.

## Execution rules and setup

- [ ] Create an isolated feature worktree from the committed spec and this plan. The app-native tool was attempted but cannot recognize the nested repository; use the documented Git fallback. `.worktrees/` must be ignored before creation. Use `codex/portfolio-capabilities` as the feature branch.
- [ ] Install the pinned dependencies with `pnpm install --frozen-lockfile --ignore-scripts`. Run `pnpm test` as a clean baseline. Keep the workspace's ignored `.env` and SSH/private files outside commits; use the public site URL as a process environment variable for builds.
- [ ] Dispatch one fresh implementer per task. Each task must pass independent spec review, followed by independent code-quality review, before the next implementation task. Resolve important findings and re-review.
- [ ] After all three tasks, run an independent final review and browser acceptance. User authorization supersedes skill prompts to ask which execution/merge option to choose: finish, integrate into master and verify the existing automatic release.

## File responsibilities

| File | Responsibility |
| --- | --- |
| `src/lib/project-capabilities.ts` | Ordered capability definitions and capability ID type |
| `src/lib/projects.ts` | Project types, metadata validation, grouping and outcome selection |
| `src/content.config.ts` | Content collection schema matching the metadata contract |
| `src/data/projects/*.md` | Eight canonical content records and stable cross-direction anchors |
| `scripts/validate-projects.ts` | Existing source/image validation plus source anchor checks |
| `tests/projects.test.ts` | Existing project regressions, updated fixtures for the new schema |
| `tests/project-capabilities.test.ts` | Grouping, cross-direction evidence and invalid metadata behavior |
| `src/components/projects/CapabilityOverview.astro` | Three equal native anchor links |
| `src/components/projects/CapabilitySection.astro` | Section heading, unique cards and lightweight related evidence |
| `src/components/projects/ProjectOutcome.astro` | Escaped full outcome text with a selected emphasis fragment |
| `src/components/projects/ProjectCard.astro` | Contribution-first compact horizontal card |
| `src/pages/projects/index.astro` | Portfolio page composition and unique count |
| `src/layouts/ProjectLayout.astro` | Structured outcomes, capabilities and primary-section return links |
| `scripts/validate-project-output.py` | Validate IDs, project cardinality and project/section links in built HTML |
| `tests/test_project_output.py` | Real HTML fixture tests for the output verifier |
| `.github/workflows/deploy.yml` | Run the new Python tests and built-output verifier before packaging |

## Task 1 — Canonical content, classification and validation

**Files:** Create the capabilities module and capability tests; modify project types, content schema, source validator, eight Markdown files and the existing project tests. In the two existing rendering consumers, only adapt outcome strings to `outcome.text` to keep the intermediate commit buildable; full presentation belongs to Task 2.

- [ ] **Write failing behavioral tests first.** Extend the known valid fixture with the new contract and add cases for grouping, repeated secondary capabilities, invalid IDs/counts and broken references. Core fixture shape:

```ts
const demo = {
  slug: 'demo', title: '示例', context: '真实业务', period: '2026',
  summary: '共享盘环境中的业务交付', role: '独立开发', tags: ['Python'],
  order: 1, links: [], primaryCapability: 'fullstack', secondaryEvidence: [],
  outcomes: [{ id: 'users', text: '累计服务 170+ 用户', emphasis: '170+' }],
  card: { contributions: ['完成客户端与桌面交付'],
    primaryOutcomeId: 'users', tags: ['Python'] },
};
```

Test assertions must include this project's unique occurrence and its independently derived related evidence:

```ts
const project = { data: { ...demo, secondaryEvidence: [{
  capability: 'agents', title: '工具调用', summary: '接入业务工具', anchor: 'agent-work',
}] } };
const sections = getProjectSections([project]);
assert.equal(sections[0].projects.length, 1);
assert.equal(sections[1].projects.length, 0);
assert.equal(sections[1].related[0].project.data.slug, 'demo');
assert.equal(sections.flatMap(section => section.projects).length, 1);
assert.throws(() => validateProjects([{ ...demo,
  card: { ...demo.card, primaryOutcomeId: 'missing' } }]), /demo.*成果/);
```

- [ ] Run `pnpm exec tsx --test tests/project-capabilities.test.ts`; observe missing exports or the absent contract fail before implementation.
- [ ] Implement ordered capability definitions. IDs, names, copy and keywords come verbatim from spec §3.1. Export `CapabilityId` and `CAPABILITIES`; these must contain no project content or rendering code.
- [ ] Implement the following project contract; preserve existing metadata fields not shown here:

```ts
interface ProjectOutcome { id: string; text: string; emphasis?: string }
interface SecondaryEvidence {
  capability: CapabilityId; title: string; summary: string; anchor: string;
}
interface ProjectCardMetadata {
  contributions: string[]; primaryOutcomeId: string; secondaryOutcomeId?: string;
  tags: string[]; sourceLinkIndex?: number;
}
// ProjectMetadata gains primaryCapability, secondaryEvidence, card,
// and outcomes becomes ProjectOutcome[]. secondaryEvidence defaults to [].
// getProjectSections<T extends {data: ProjectMetadata}>(projects: T[]) returns:
// Array<{...capabilityDefinition, projects: T[],
//   related: Array<{project: T; evidence: SecondaryEvidence}>}>.
// getCardOutcomes(data: ProjectMetadata) returns
// {primary: ProjectOutcome; secondary?: ProjectOutcome}.
```

Validation must reject: missing/invalid primary capability; repeated or primary-equal secondary capability; blank evidence title/summary; unsafe/blank fragment ID; duplicate outcome IDs; blank outcome text; emphasis absent from the text or occurring more than once; empty or >2 contributions; empty or >3 card tags; card tags absent from full tags; missing or identical selected outcome IDs; invalid or out-of-range zero-based source index. Keep slug, filename, image and HTTP(S) link validation intact. Errors identify project and field; parse arrays/objects defensively before dereferencing.

- [ ] Match the Astro collection schema to the same contract. Default secondary evidence to an empty array. Keep image handling and current blog schema untouched.
- [ ] Migrate the eight Markdown records from the existing facts. Main placement: POMP/华小博/保利 → fullstack; 新华医疗/奥迪诊断 → agents; AISHPerf/DCU/移动安全对齐 → training-inference. Retain original `order`, all image references, all existing links and body facts. Every initial card has exactly two concise contribution statements and ≤3 selected tags. Retain all original outcomes in canonical structured data; add no unsupported metrics.
- [ ] Configure exactly two initial secondary evidence entries: AISHPerf→agents at `agent-selection`, 华小博→agents at `rag-guide`. Add explicit ID aliases next to the relevant existing content so old Markdown heading IDs remain intact. Source validation must check that each declared explicit alias occurs once in its own body.
- [ ] Choose one primary and at most one secondary outcome per card. Preserve metric conditions in the complete outcome text. AISHPerf's main card emphasizes evaluation work, with its agent ownership still visible in the two contribution statements/secondary evidence; its selected source index is 0. Preserve all full outcomes in detail consumers by switching their existing text render from the string to `.text`.
- [ ] Run `pnpm test`, `pnpm check` and `pnpm exec tsx scripts/validate-projects.ts`. Expected: all tests pass, no type errors, eight projects/eleven images. Commit `feat: classify portfolio projects and validate capability evidence`.

## Task 2 — Portfolio presentation and detail linkage

**Files:** Create the three focused Astro components in the file table; modify the existing project card, overview and detail layout.

- [ ] Read the shared card/theme styles before editing. Reuse `--primary-*`, `--darkslate-*`, `.card`, native focus links and the existing motion preference. No new UI library or hardcoded category colors.
- [ ] Build `ProjectOutcome.astro` with props `{outcome: ProjectOutcome, prominent?: boolean}`. Render escaped text, not raw HTML. Split the text around its one validated emphasis fragment; only that fragment receives the emphasis element. Whitespace normalization in the output must preserve the same readable outcome text. Plain outcomes render without a forced number.
- [ ] Build `CapabilityOverview.astro` with three equal links to `#fullstack`, `#agents`, `#training-inference`. Each displays definition name, description and keywords. Use a desktop three-column grid and a single-column narrow layout. Titles must not compete with the page h1/section h2 hierarchy.
- [ ] Build `CapabilitySection.astro` accepting one derived section. Use the capability ID on the section and h2 for its name. Render each unique card once and only render related practice when present. The implementation must expose semantic output markers used by Task 3:

```html
<section id="fullstack" data-capability-id="fullstack">...</section>
<article data-project-slug="pomp">...</article>
<a data-related-project="aishperf"
   href="/projects/aishperf/#agent-selection">...</a>
```

Related rows contain the project identity, evidence title/summary and one direct detail-fragment link. Card secondary capability links have the same destination but are not marked as a related row.

- [ ] Rework `ProjectCard.astro`: left cover ≈1/3, right text ≈2/3; narrow screens stack. Identity metadata → title h3 → shared summary → two contribution statements → selected main/optional secondary outcome → ≤3 tags/optional secondary evidence → detail/optional one source link. Mark selected outcomes with `data-outcome-kind="primary"` or `"secondary"`. Render only the selected source index and retain all links on details. Main card and result text must not have a fixed text height, line clamp, internal scroll or hidden conditions. Use the shared theme classes for borders/background/focus; keep screenshot/text fallback wrappers consistent. Match spec POMP content and facts.
- [ ] Compose overview page with h1 “项目作品集”, the approved positioning sentence, three overview links, unique count and all three derived sections in order. Keep homepage/blog links. Native anchors remain functional without JS. Set `scroll-margin-top` on section/fragment targets and smooth scrolling only when reduced motion is not requested; scope any CSS appropriately.
- [ ] Update `ProjectLayout.astro`: full canonical outcomes using the shared outcome component, primary/secondary capability links, top and bottom return links to `/projects/#<primary>`. Preserve Markdown headings, TOC, gallery, full role, all external links and existing routes. Secondary evidence references resolve to stable aliases added in Task 1.
- [ ] Run `pnpm test`, `pnpm check`, then build with `PUBLIC_SITE_URL=http://81.70.231.92:8550/` in the process environment. Expected: no type errors and a successful static/SSR build. Inspect built index for three sections, eight articles, two related rows and working anchor targets. Commit `feat: present portfolio capabilities with contribution-first cards`.

## Task 3 — Verify rendered output and gate releases

**Files:** Create `scripts/validate-project-output.py`, `tests/test_project_output.py`; modify `.github/workflows/deploy.yml` and README's portfolio authoring instructions.

- [ ] Write failing tests using temporary directories and small real HTML documents parsed with Python `html.parser.HTMLParser`. Cover a valid fixture, repeated project, project placed under wrong section, missing/duplicate detail anchor, bad section return link, missing primary outcome and excess card contributions/tags/outcomes. Fixtures contain project metadata in the existing JSON-frontmatter format and actual `dist/client/projects/.../index.html` files. Unit tests invoke a public `validate_output(root: Path)` and assert `ValueError` for failures.

```python
def test_missing_related_anchor_rejected(self):
    root = self.make_valid_fixture()
    target = root / 'dist/client/projects/demo/index.html'
    target.write_text('<main><a href="/projects/#fullstack">返回</a></main>', encoding='utf-8')
    with self.assertRaisesRegex(ValueError, 'agent-work'):
        validate_output(root)
```

- [ ] Run `python -m unittest discover -s tests -p 'test_project_output.py' -v`; observe import/validation failure before implementation.
- [ ] Implement the bounded-scope verifier using only the Python standard library. Read JSON-frontmatter records from `src/data/projects`; parse the built overview and each corresponding detail HTML. Use node ancestry, actual IDs and decoded hrefs, not string-search snapshots. Reject duplicate IDs, wrong or repeated project placement, malformed/missing required markers, unexpected/missing related entries, absent fragment targets, wrong top/footer primary-section returns, card count limits and missing primary outcome. Main card count and related counts must derive from source records, not a fixed eight or fixed two. Validate source-relative project links only against paths contained in the build tree. Print a concise Chinese success summary; never read env/database files.
- [ ] In workflow tests, change Python discovery to `-p 'test_*.py'`; after the existing `pnpm build`, run `python3 scripts/validate-project-output.py`. This must complete before Docker packaging/SSH. Keep trigger, permissions, concurrency, keys, variables, image build and port settings unchanged.
- [ ] Document adding projects with one primary capability, structured outcomes and optional secondary evidence; include `pnpm test`, `pnpm check`, `pnpm build`, Python tests and `python scripts/validate-project-output.py` commands.
- [ ] Run `pnpm test`, `python -m unittest discover -s tests -p 'test_*.py' -v`, `pnpm check`, `pnpm build`, `python scripts/validate-project-output.py`, actionlint and `git diff --check`. Expected: all checks pass; deliberately removed output anchor fails the verifier using a temporary fixture, never damage the actual build. Commit `test: gate deployment on rendered portfolio integrity`.

## Final acceptance and release — controller

- [ ] Use the computer/browser tools to inspect local `/projects/` at 1440, 768, 390 and 320 CSS pixels, plus enlarged text. Check overview, card density, both related anchors, return links, focus and image presentation. Exercise default yellow Neon, another color and a non-Neon style; persistence across navigation; reduced-motion and JS-independent anchors. Save screenshots locally, fix findings through the responsible implementer, then re-review affected changes.
- [ ] Run independent final review after task reviews pass. Confirm only intended content/UI/validation files changed, no runtime credentials or database files tracked, and full validation evidence is current.
- [ ] Capture current server website/other-container IDs and StartedAt, Nginx/.app.env checksums and guestbook/session preservation baseline through the existing ignored `.deploy` helpers. Create/clean only temporary acceptance data.
- [ ] Fast-forward local master to the reviewed feature branch and push the fork's master. Follow the actual Actions run to completion; resolve failures and retry. Do not manually replace the trusted root publisher, server config or database.
- [ ] Verify public 8550 overview and both detail fragments, deployed commit, healthy app/web, unchanged existing projects/config/secrets and preserved guestbook/session rows. Remove only test entries; record the workflow URL and validation evidence locally or in the implementation handoff. Clean Git and a matching master/remote commit are required before final completion.
