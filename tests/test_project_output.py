"""Regression fixtures for the rendered portfolio release gate (no production mutations)."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'validate-project-output.py'
CAPABILITIES = ('fullstack', 'agents', 'training-inference')


class ProjectOutputTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'src/data/projects'
        self.source.mkdir(parents=True)
        self.output = self.root / 'dist/client/projects'
        self.output.mkdir(parents=True)
        self.projects = []
        for number, capability in enumerate(CAPABILITIES):
            slug = f'project-{number}'
            project = dict(slug=slug, title=f'项目 {number}', primaryCapability=capability,
                           secondaryEvidence=[], outcomes=[dict(id='main', text='固定矩阵下 42h → 17h', emphasis='42h → 17h'),
                           dict(id='other', text='第二项成果')],
                           links=[dict(label='项目源码', url='https://example.org/source')],
                           card=dict(contributions=['负责交付', '完成维护'], tags=['Python', 'SQL'],
                                     primaryOutcomeId='main', secondaryOutcomeId='other', sourceLinkIndex=0))
            if number == 0:
                project['secondaryEvidence'] = [dict(capability='agents', title='关联实践', summary='关联依据', anchor='evidence')]
            self.projects.append(project)
        self.write_sources()
        for project in self.projects:
            self.write_detail(project)
        self.overview = self.render_overview()
        self.write_overview()

    def write_sources(self):
        for project in self.projects:
            (self.source / f"{project['slug']}.md").write_text('---\n' + json.dumps(project, ensure_ascii=False) + '\n---\n正文', encoding='utf-8')

    def card(self, project):
        slug = project['slug']
        secondary = ''.join(f'<a href="/projects/{slug}/#{evidence["anchor"]}">同时覆盖</a>' for evidence in project['secondaryEvidence'])
        return f'''<article data-project-slug="{slug}"><img src="/cover.png"><!-- ignored <section> -->
        <a class="project-cover" href="/projects/{slug}/"><svg><path d="M0 0"/></svg></a>
        <h3><a href="/projects/{slug}/">{project['title']}</a></h3>
        <ul><li data-project-contribution>负责交付</li><li data-project-contribution>完成维护</li></ul>
        <ul class="outcomes"><li data-outcome-kind="primary"><span class="project-outcome prominent">固定矩阵下 <strong>42h → 17h</strong></span></li>
        <li data-outcome-kind="secondary"><span class="project-outcome">第二项成果</span></li></ul>
        <ul><li data-project-tag>Python</li><li data-project-tag>SQL</li></ul>
        <div class="secondary-capabilities">{secondary}</div>
        <div class="links"><a class="detail" href="/projects/{slug}/">查看项目详情</a>
        <a href="https://example.org/source">项目源码</a></div></article>'''

    def render_overview(self):
        result = '<main><nav class="capability-overview">' + ''.join(f'<a href="#{c}">{c}</a>' for c in CAPABILITIES) + '</nav>'
        for capability in CAPABILITIES:
            result += f'<section id="{capability}" data-capability-id="{capability}">'
            result += ''.join(self.card(p) for p in self.projects if p['primaryCapability'] == capability)
            if capability == 'agents':
                result += '<aside class="related"><ul><li><a data-related-project="project-0" href="/projects/project-0/#evidence"><span class="related-title">项目 0 · 关联实践 ↗</span><span class="related-summary">关联依据</span></a></li></ul></aside>'
            result += '</section>'
        return result + '</main>'

    def write_overview(self):
        (self.output / 'index.html').write_text(self.overview, encoding='utf-8')

    def detail_path(self, slug='project-0'):
        return self.output / slug / 'index.html'

    def write_detail(self, project):
        directory = self.output / project['slug']
        directory.mkdir(exist_ok=True)
        href = f"/projects/#{project['primaryCapability']}"
        secondary = ''.join(f'<a href="/projects/{project["slug"]}/#{evidence["anchor"]}">同时覆盖</a>' for evidence in project['secondaryEvidence'])
        self.detail_path(project['slug']).write_text(f'''<main class="project-page"><span class="btn-shell"><a class="btn--ns btn-chrome" href="{href}">← 返回作品集</a></span>
        <header class="project-header"><nav class="capability-links"><a href="{href}">主能力</a>{secondary}</nav>
        <ul class="outcomes"><li><span class="project-outcome prominent">固定矩阵下 <strong>42h → 17h</strong></span></li><li><span class="project-outcome">第二项成果</span></li></ul></header>
        <article class="project-prose"><h2 id="evidence">依据</h2><a href="#evidence">目录</a></article>
        <footer class="project-footer"><a href="{href}">← 浏览全部项目</a><a href="/">首页</a></footer></main>''', encoding='utf-8')

    def validate(self):
        self.assertTrue(SCRIPT.exists(), 'rendered output validator has not been implemented')
        spec = importlib.util.spec_from_file_location('project_output_validator', SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.validate_output(self.root)

    def reject_overview(self, old, new):
        self.assertIn(old, self.overview)
        self.overview = self.overview.replace(old, new, 1)
        self.write_overview()
        with self.assertRaises(ValueError):
            self.validate()

    def reject_detail(self, old, new):
        path = self.detail_path()
        text = path.read_text(encoding='utf-8')
        self.assertIn(old, text)
        path.write_text(text.replace(old, new, 1), encoding='utf-8')
        with self.assertRaises(ValueError):
            self.validate()

    def test_valid_fixture_with_void_svg_and_comments(self):
        self.validate()

    def test_project_count_is_derived_from_source(self):
        extra = dict(self.projects[2], slug='project-3', title='项目 3')
        self.projects.append(extra)
        self.write_sources()
        self.write_detail(extra)
        self.overview = self.render_overview()
        self.write_overview()
        self.validate()

    def test_duplicate_project(self):
        self.reject_overview('</main>', self.card(self.projects[0]) + '</main>')

    def test_missing_project(self):
        self.reject_overview(self.card(self.projects[0]), '')

    def test_wrong_section(self):
        first, second = self.card(self.projects[0]), self.card(self.projects[1])
        self.overview = self.overview.replace(first, '__FIRST__').replace(second, first).replace('__FIRST__', second)
        self.write_overview()
        with self.assertRaisesRegex(ValueError, 'wrong capability section'):
            self.validate()

    def test_sections_wrong_order(self):
        self.reject_overview('id="fullstack" data-capability-id="fullstack"', 'id="agents" data-capability-id="agents"')

    def test_missing_detail_anchor(self):
        self.reject_detail('id="evidence"', 'id="other"')

    def test_duplicate_detail_anchor(self):
        self.reject_detail('</article>', '<span id="evidence"></span></article>')

    def test_duplicate_overview_id(self):
        self.reject_overview('</main>', '<span id="agents"></span></main>')

    def test_wrong_top_return_even_with_correct_header_link(self):
        self.reject_detail('class="btn--ns btn-chrome" href="/projects/#fullstack"', 'class="btn--ns btn-chrome" href="/projects/#agents"')

    def test_wrong_footer_return(self):
        self.reject_detail('<footer class="project-footer"><a href="/projects/#fullstack">', '<footer class="project-footer"><a href="/projects/#agents">')

    def test_missing_top_return(self):
        self.reject_detail('class="btn--ns btn-chrome"', 'class="unrelated"')

    def test_missing_primary_result(self):
        self.reject_overview('data-outcome-kind="primary"', 'data-outcome-kind="secondary"')

    def test_duplicate_primary_result(self):
        self.reject_overview('data-outcome-kind="secondary"', 'data-outcome-kind="primary"')

    def test_excess_secondary_results(self):
        self.reject_overview('<ul class="outcomes">', '<ul class="outcomes"><li data-outcome-kind="secondary">extra</li>')

    def test_excess_contributions(self):
        self.reject_overview('<li data-project-contribution>负责交付</li>', '<li data-project-contribution>负责交付</li>' * 3)

    def test_excess_tags(self):
        self.reject_overview('<li data-project-tag>Python</li>', '<li data-project-tag>Python</li>' * 4)

    def test_lost_outcome_qualifier(self):
        self.reject_overview('固定矩阵下 <strong>', '<strong>')

    def test_wrong_contribution_text(self):
        self.reject_overview('负责交付', '别人的贡献')

    def test_wrong_tags(self):
        self.reject_overview('data-project-tag>Python', 'data-project-tag>Java')

    def test_missing_source_link(self):
        self.reject_overview('<a href="https://example.org/source">项目源码</a>', '')

    def test_missing_related_row(self):
        self.reject_overview('data-related-project="project-0"', 'data-unrelated="project-0"')

    def test_broken_related_destination(self):
        self.reject_overview('data-related-project="project-0" href="/projects/project-0/#evidence"', 'data-related-project="project-0" href="/projects/project-1/#evidence"')

    def test_related_wrong_capability_parent(self):
        row = '<aside class="related"><ul><li><a data-related-project="project-0" href="/projects/project-0/#evidence"><span class="related-title">项目 0 · 关联实践 ↗</span><span class="related-summary">关联依据</span></a></li></ul></aside>'
        self.overview = self.overview.replace(row, '')
        self.reject_overview('</main>', row + '</main>')

    def test_escaping_project_link(self):
        self.reject_overview('href="/projects/project-0/"', 'href="/projects/../../outside/"')

    def test_encoded_traversal_project_link(self):
        self.reject_overview('href="/projects/project-0/"', 'href="/projects/%2e%2e/%2e%2e/outside/"')

    def test_foreign_project_link(self):
        self.reject_overview('class="detail" href="/projects/project-0/"', 'class="detail" href="https://other.example/projects/project-0/"')

    def test_broken_section_navigation(self):
        self.reject_overview('href="#agents"', 'href="#missing"')

    def test_related_count_is_derived_from_source(self):
        evidence = dict(capability='training-inference', title='第二个关联', summary='更多依据', anchor='evidence')
        self.projects[1]['secondaryEvidence'] = [evidence]
        self.write_detail(self.projects[1])
        self.overview = self.render_overview()
        self.write_sources()
        row = '<aside class="related"><ul><li><a data-related-project="project-1" href="/projects/project-1/#evidence"><span class="related-title">项目 1 · 第二个关联 ↗</span><span class="related-summary">更多依据</span></a></li></ul></aside>'
        self.overview = self.overview.replace('</section></main>', row + '</section></main>')
        self.write_overview()
        self.assertEqual(self.validate()['related'], 2)

    def test_optional_secondary_outcome_and_source(self):
        self.projects[0]['card'].pop('secondaryOutcomeId')
        self.projects[0]['card'].pop('sourceLinkIndex')
        self.write_sources()
        self.overview = self.overview.replace('<li data-outcome-kind="secondary"><span class="project-outcome">第二项成果</span></li>', '', 1)
        self.overview = self.overview.replace('<a href="https://example.org/source">项目源码</a>', '', 1)
        self.write_overview()
        self.validate()

    def test_unmarked_extra_outcome(self):
        self.reject_overview('<ul class="outcomes">', '<ul class="outcomes"><li>第三项成果</li>')

    def test_related_title_preserves_project_identity(self):
        self.reject_overview('class="related-title">项目 0 · 关联实践', 'class="related-title">其他项目 · 关联实践')

    def test_duplicate_related_row(self):
        row = '<a data-related-project="project-0" href="/projects/project-0/#evidence"><span class="related-title">项目 0 · 关联实践 ↗</span><span class="related-summary">关联依据</span></a>'
        self.reject_overview(row, row + row)

    def test_extra_outcome_outside_selected_list(self):
        self.reject_overview('<div class="links">', '<span class="project-outcome prominent">未选择的额外成果</span><div class="links">')

    def test_lost_emphasis(self):
        self.reject_overview('<strong>42h → 17h</strong>', '42h → 17h')

    def test_source_link_uses_selected_index(self):
        self.projects[0]['links'].insert(0, dict(label='其他链接', url='https://example.org/other'))
        self.projects[0]['card']['sourceLinkIndex'] = 1
        self.write_sources()
        self.validate()

    def test_broken_relative_detail_link(self):
        self.reject_detail('</article>', '<a href="missing/">失效链接</a></article>')

    def test_foreign_footer_return(self):
        self.reject_detail('<footer class="project-footer"><a href="/projects/#fullstack">', '<footer class="project-footer"><a href="https://example.org/projects/#fullstack">')

    def test_return_to_foreign_site_path(self):
        self.reject_detail('<footer class="project-footer"><a href="/projects/#fullstack">', '<footer class="project-footer"><a href="/other/#fullstack">')

    def test_missing_detail_file(self):
        self.detail_path().unlink()
        with self.assertRaisesRegex(ValueError, 'missing built artifact'):
            self.validate()

    def test_card_secondary_link_wrong_project(self):
        self.reject_overview('<div class="secondary-capabilities"><a href="/projects/project-0/#evidence">', '<div class="secondary-capabilities"><a href="/projects/project-1/#evidence">')

    def test_detail_secondary_link_foreign_path(self):
        self.reject_detail('href="/projects/project-0/#evidence"', 'href="/other/#evidence"')

    def test_detail_result_qualifier_lost(self):
        self.reject_detail('固定矩阵下 <strong>', '<strong>')


if __name__ == '__main__':
    unittest.main()
