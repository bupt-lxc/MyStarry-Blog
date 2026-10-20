#!/usr/bin/env python3
"""Check the generated portfolio before packaging; uses only source metadata and HTML."""
import argparse
from collections import Counter
from html.parser import HTMLParser
import json
from pathlib import Path
import sys
from urllib.parse import unquote, urlsplit

CAPABILITIES = ('fullstack', 'agents', 'training-inference')
VOID_TAGS = frozenset('area base br col embed hr img input link meta param source track wbr'.split())


def require(condition, message):
    if not condition:
        raise ValueError(message)


def normalized(text):
    return ' '.join(text.split())


class Element:
    def __init__(self, tag, attrs=(), parent=None):
        self.tag = tag
        self.attrs = dict(attrs)
        self.parent = parent
        self.content = []

    def has_class(self, name):
        return name in self.attrs.get('class', '').split()

    def descendants(self, predicate):
        result = []
        for child in self.content:
            if isinstance(child, Element):
                if predicate(child):
                    result.append(child)
                result.extend(child.descendants(predicate))
        return result

    def text(self):
        # Do not insert spaces between inline emphasis and adjacent punctuation.
        return ''.join(child.text() if isinstance(child, Element) else child for child in self.content
                       if not isinstance(child, Element) or child.tag not in ('script', 'style', 'template'))

    def ancestor(self, predicate):
        node = self.parent
        while node is not None:
            if predicate(node):
                return node
            node = node.parent
        return None


class Document(HTMLParser):
    """Small explicit-tag tree for Astro output, not a browser/HTML5 repair engine."""
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.path = path
        self.root = Element('document')
        self.stack = [self.root]
        self.feed(path.read_text(encoding='utf-8'))
        self.close()
        self.elements = self.root.descendants(lambda node: True)
        self.ids = Counter(node.attrs['id'] for node in self.elements if 'id' in node.attrs)
        duplicates = [key for key, count in self.ids.items() if count != 1]
        require(not duplicates, f'{path}: duplicate IDs: {duplicates}')

    def handle_starttag(self, tag, attrs):
        node = Element(tag, attrs, self.stack[-1])
        self.stack[-1].content.append(node)
        if tag not in VOID_TAGS:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        node = Element(tag, attrs, self.stack[-1])
        self.stack[-1].content.append(node)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                return

    def handle_data(self, data):
        self.stack[-1].content.append(data)

    def find(self, predicate):
        return [node for node in self.elements if predicate(node)]


def load_projects(root):
    projects = {}
    for path in sorted((root / 'src/data/projects').glob('*.md')):
        lines = path.read_text(encoding='utf-8-sig').splitlines()
        require(lines and lines[0] == '---', f'{path}: missing JSON frontmatter')
        try:
            end = lines.index('---', 1)
            data = json.loads('\n'.join(lines[1:end]))
            # Match the Astro collection schema default for omitted optional evidence.
            data.setdefault('secondaryEvidence', [])
            slug = data['slug']
            require(isinstance(slug, str) and slug and
                    all(character in 'abcdefghijklmnopqrstuvwxyz0123456789-' for character in slug),
                    f'{path}: unsafe project slug')
            require(slug not in projects, f'{path}: duplicate source project {slug}')
            require(data['primaryCapability'] in CAPABILITIES, f'{slug}: unknown primary capability')
            require(1 <= len(data['card']['contributions']) <= 2, f'{slug}: expected 1–2 contributions')
            require(1 <= len(data['card']['tags']) <= 3, f'{slug}: expected 1–3 card tags')
            projects[slug] = data
        except (KeyError, TypeError, json.JSONDecodeError, ValueError) as error:
            raise ValueError(f'{path}: invalid project metadata: {error}') from error
    require(projects, f'{root}: no project metadata found')
    return projects


def local_destination(href, page, build):
    """Resolve URL paths portably and reject traversal before filesystem normalization."""
    parts = urlsplit(href)
    require(not parts.scheme and not parts.netloc, f'{page}: expected local project URL, got {href!r}')
    path = unquote(parts.path)
    require('\\' not in path and '\x00' not in path and '..' not in path.split('/'),
            f'{page}: unsafe navigation path {href!r}')
    destination = (build / path.lstrip('/') if path.startswith('/') else page.parent / path).resolve()
    require(destination.is_relative_to(build), f'{page}: navigation escapes build tree: {href!r}')
    if not path or path.endswith('/') or destination.is_dir():
        destination = destination / 'index.html' if path else page
    return destination, unquote(parts.fragment)


def expect_link(node, target, fragment, page, build, label):
    require(node is not None and node.tag == 'a', f'{label}: missing navigation link')
    destination, actual_fragment = local_destination(node.attrs.get('href', ''), page, build)
    require((destination, actual_fragment) == (target, fragment),
            f'{label}: expected {target.name}#{fragment}, got {node.attrs.get("href")!r}')


def exactly_one(nodes, label):
    require(len(nodes) == 1, f'{label}: expected exactly once, found {len(nodes)}')
    return nodes[0]


def text_equal(node, text, label):
    require(normalized(node.text()) == normalized(text), f'{label}: rendered text differs from source: {node.text()!r}')


def check_outcome(node, outcome, label, prominent):
    text_equal(node, outcome['text'], label)
    spans = node.descendants(lambda item: item.has_class('project-outcome'))
    span = exactly_one(spans, label + ' outcome span')
    require(span.has_class('prominent') == prominent, f'{label}: incorrect primary emphasis')
    emphasis = outcome.get('emphasis')
    if emphasis:
        strong = exactly_one(span.descendants(lambda item: item.tag == 'strong'), label + ' emphasis')
        text_equal(strong, emphasis, label + ' emphasis')


def validate_output(root: Path):
    root = Path(root).resolve()
    build = (root / 'dist/client').resolve()
    overview_path = build / 'projects/index.html'
    projects = load_projects(root)
    cache = {}

    def document(path):
        require(path.is_file(), f'{path}: missing built artifact (run pnpm build first)')
        if path not in cache:
            cache[path] = Document(path)
        return cache[path]

    overview = document(overview_path)
    sections = overview.find(lambda node: 'data-capability-id' in node.attrs)
    require([(node.tag, node.attrs.get('id'), node.attrs['data-capability-id']) for node in sections] ==
            [('section', capability, capability) for capability in CAPABILITIES],
            'overview: expected ordered fullstack, agents, training-inference sections with matching IDs')
    nav = exactly_one(overview.find(lambda node: node.tag == 'nav' and node.has_class('capability-overview')), 'overview capability navigation')
    nav_links = nav.descendants(lambda node: node.tag == 'a')
    require(len(nav_links) == 3, 'overview: expected three capability navigation links')
    for node, capability in zip(nav_links, CAPABILITIES):
        expect_link(node, overview_path, capability, overview_path, build, 'overview capability ' + capability)

    cards = overview.find(lambda node: 'data-project-slug' in node.attrs)
    require(Counter(node.attrs['data-project-slug'] for node in cards) == Counter(projects.keys()),
            f'overview: project cards must occur exactly once; expected {list(projects)}, got {[node.attrs["data-project-slug"] for node in cards]}')
    for card in cards:
        slug = card.attrs['data-project-slug']
        data = projects[slug]
        require(card.tag == 'article', f'{slug}: project card must be an article')
        section = card.ancestor(lambda node: node.tag == 'section' and 'data-capability-id' in node.attrs)
        require(section is not None and section.attrs['data-capability-id'] == data['primaryCapability'],
                f'{slug}: project card is in wrong capability section')
        contributions = exactly_one(card.descendants(lambda node: node.has_class('contributions')),
                                    f'{slug}: contributions container')
        contribution_list = exactly_one(contributions.descendants(lambda node: node.tag == 'ul'),
                                        f'{slug}: contributions list')
        tag_list = exactly_one(card.descendants(lambda node: node.tag == 'ul' and node.has_class('tags')),
                              f'{slug}: tags list')
        for container, attribute, expected, minimum, maximum in (
                (contribution_list, 'data-project-contribution', data['card']['contributions'], 1, 2),
                (tag_list, 'data-project-tag', data['card']['tags'], 1, 3)):
            # Inspect actual list contents first: unmarked or nested entries must
            # not disappear merely because the marker-based query skips them.
            items = [node for node in container.content if isinstance(node, Element)]
            marked = card.descendants(lambda node: attribute in node.attrs)
            require(minimum <= len(items) <= maximum and all(node.tag == 'li' for node in items),
                    f'{slug}: invalid {attribute} count or element')
            require(items == container.descendants(lambda node: node.tag == 'li') == marked,
                    f'{slug}: missing, misplaced, or unexpected {attribute} markers/list entries')
            require([normalized(node.text()) for node in items] == [normalized(text) for text in expected],
                    f'{slug}: rendered {attribute} differs from source')
        outcomes = {outcome['id']: outcome for outcome in data['outcomes']}
        selected = card.descendants(lambda node: 'data-outcome-kind' in node.attrs)
        kinds = ['primary'] + (['secondary'] if data['card'].get('secondaryOutcomeId') else [])
        require([node.attrs['data-outcome-kind'] for node in selected] == kinds and
                all(node.tag == 'li' for node in selected), f'{slug}: expected one primary and optional one secondary outcome')
        outcome_list = exactly_one(card.descendants(lambda node: node.tag == 'ul' and node.has_class('outcomes')), f'{slug}: outcome list')
        require([node for node in outcome_list.content if isinstance(node, Element)] == selected,
                f'{slug}: unexpected unmarked outcome or misplaced selected outcome')
        require(len(card.descendants(lambda node: node.has_class('project-outcome'))) == len(selected),
                f'{slug}: unexpected outcome outside selected list')
        for item, kind in zip(selected, kinds):
            outcome = outcomes[data['card'][kind + 'OutcomeId']]
            check_outcome(item, outcome, f'{slug}: {kind} outcome', kind == 'primary')
        detail_path = build / 'projects' / slug / 'index.html'
        for class_name in ('project-cover', 'detail'):
            link = exactly_one(card.descendants(lambda node: node.tag == 'a' and node.has_class(class_name)), f'{slug}: {class_name}')
            expect_link(link, detail_path, '', overview_path, build, f'{slug}: {class_name}')
        secondary_links = card.descendants(lambda node: node.tag == 'a' and
                                           node.ancestor(lambda parent: parent.has_class('secondary-capabilities')) is not None)
        require(len(secondary_links) == len(data['secondaryEvidence']), f'{slug}: incorrect secondary capability links')
        for link, evidence in zip(secondary_links, data['secondaryEvidence']):
            expect_link(link, detail_path, evidence['anchor'], overview_path, build, f'{slug}: card secondary capability')
        title = exactly_one(card.descendants(lambda node: node.tag == 'h3'), f'{slug}: title')
        text_equal(title, data['title'], f'{slug}: title')
        title_link = exactly_one(title.descendants(lambda node: node.tag == 'a'), f'{slug}: title link')
        expect_link(title_link, detail_path, '', overview_path, build, f'{slug}: title link')
        links = exactly_one(card.descendants(lambda node: node.has_class('links')), f'{slug}: action links')
        source_links = links.descendants(lambda node: node.tag == 'a' and not node.has_class('detail'))
        source_index = data['card'].get('sourceLinkIndex')
        require(len(source_links) == (0 if source_index is None else 1), f'{slug}: incorrect selected source link count')
        if source_index is not None:
            expected = data['links'][source_index]
            require(source_links[0].attrs.get('href') == expected['url'] and
                    normalized(expected['label']) in normalized(source_links[0].text()), f'{slug}: incorrect selected source link')

    actual_related = []
    for link in overview.find(lambda node: 'data-related-project' in node.attrs):
        slug = link.attrs['data-related-project']
        require(link.tag == 'a' and slug in projects, f'{slug}: unknown related project')
        section = link.ancestor(lambda node: node.tag == 'section' and 'data-capability-id' in node.attrs)
        require(section is not None and link.ancestor(lambda node: node.has_class('related')) is not None,
                f'{slug}: related entry must belong to a capability related row')
        target, fragment = local_destination(link.attrs.get('href', ''), overview_path, build)
        require(target == build / 'projects' / slug / 'index.html', f'{slug}: related destination targets wrong project')
        capability = section.attrs['data-capability-id']
        actual_related.append((capability, slug, fragment))
        evidence = next((entry for entry in projects[slug]['secondaryEvidence']
                         if entry['capability'] == capability and entry['anchor'] == fragment), None)
        require(evidence is not None, f'{slug}: unexpected related capability or fragment')
        title = exactly_one(link.descendants(lambda node: node.has_class('related-title')), f'{slug}: related title')
        text_equal(title, projects[slug]['title'].split('｜')[0] + ' · ' + evidence['title'] + ' ↗', f'{slug}: related title')
        summary = exactly_one(link.descendants(lambda node: node.has_class('related-summary')), f'{slug}: related summary')
        text_equal(summary, evidence['summary'], f'{slug}: related summary')
    expected_related = [(entry['capability'], slug, entry['anchor']) for slug, data in projects.items() for entry in data['secondaryEvidence']]
    require(Counter(actual_related) == Counter(expected_related), 'overview: related rows differ from source evidence')

    for slug, data in projects.items():
        page = build / 'projects' / slug / 'index.html'
        detail = document(page)
        for evidence in data['secondaryEvidence']:
            require(detail.ids[evidence['anchor']] == 1, f'{slug}: missing/duplicate own evidence anchor #{evidence["anchor"]}')
        main = exactly_one(detail.find(lambda node: node.tag == 'main' and node.has_class('project-page')), f'{slug}: detail main')
        header = exactly_one(main.descendants(lambda node: node.tag == 'header' and node.has_class('project-header')), f'{slug}: detail header')
        top = exactly_one(main.descendants(lambda node: node.tag == 'a' and node.has_class('btn-chrome') and
                         node.ancestor(lambda parent: parent.has_class('btn-shell')) is not None), f'{slug}: top return')
        require(top.ancestor(lambda node: node.has_class('project-header') or node.tag == 'footer') is None and
                detail.elements.index(top) < detail.elements.index(header), f'{slug}: return button must be above detail header')
        footer = exactly_one(main.descendants(lambda node: node.tag == 'footer' and node.has_class('project-footer')), f'{slug}: footer')
        footer_links = footer.descendants(lambda node: node.tag == 'a')
        require(footer_links, f'{slug}: missing footer return')
        capability_nav = exactly_one(header.descendants(lambda node: node.tag == 'nav' and node.has_class('capability-links')), f'{slug}: primary capability navigation')
        capability_links = capability_nav.descendants(lambda node: node.tag == 'a')
        require(len(capability_links) == 1 + len(data['secondaryEvidence']), f'{slug}: incorrect detail capability links')
        for link, evidence in zip(capability_links[1:], data['secondaryEvidence']):
            expect_link(link, page, evidence['anchor'], page, build, f'{slug}: detail secondary capability')
        for label, node in (('top return', top), ('footer return', footer_links[0]), ('primary capability', capability_links[0])):
            expect_link(node, overview_path, data['primaryCapability'], page, build, f'{slug}: {label}')
        outcome_list = exactly_one(header.descendants(lambda node: node.tag == 'ul' and node.has_class('outcomes')), f'{slug}: detail outcomes')
        items = [node for node in outcome_list.content if isinstance(node, Element)]
        require(len(items) == len(data['outcomes']) and all(node.tag == 'li' for node in items), f'{slug}: detail outcome count differs')
        for item, outcome in zip(items, data['outcomes']):
            check_outcome(item, outcome, f'{slug}: detail outcome {outcome["id"]}', outcome['id'] == data['card']['primaryOutcomeId'])

    # Validate all project/fragment and relative links, including Markdown TOCs.
    # Other absolute site routes may be SSR, so their existence is outside this gate.
    for path, doc in list(cache.items()):
        for link in doc.find(lambda node: node.tag == 'a' and 'href' in node.attrs):
            href = link.attrs['href']
            parsed = urlsplit(href)
            if parsed.scheme or parsed.netloc:
                continue
            decoded_path = unquote(parsed.path)
            if decoded_path.startswith('/projects') or not decoded_path.startswith('/'):
                target, fragment = local_destination(href, path, build)
                require(target.is_file(), f'{path}: broken navigation {href!r}')
                if fragment:
                    require(document(target).ids[fragment] == 1, f'{path}: missing destination fragment {href!r}')
    return dict(projects=len(projects), capabilities=len(sections), related=len(expected_related))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', nargs='?', type=Path, default=Path.cwd())
    arguments = parser.parse_args()
    try:
        result = validate_output(arguments.root)
    except (ValueError, OSError) as error:
        print(f'Portfolio output validation failed: {error}', file=sys.stderr)
        return 1
    print(f"Portfolio output valid: {result['projects']} projects, {result['capabilities']} capabilities, {result['related']} related rows.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
