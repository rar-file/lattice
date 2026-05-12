from pathlib import Path

from lattice_api.indexer import chunk_markdown, parse_note, walk_vault


def test_walk_vault_skips_hidden(fixture_vault: Path) -> None:
    paths = walk_vault(fixture_vault)
    names = sorted(p.name for p in paths)
    assert names == ["kafka.md", "mongo.md", "postgres.md"]


def test_parse_note_pulls_frontmatter_title(fixture_vault: Path) -> None:
    parsed = parse_note(fixture_vault / "postgres.md")
    assert parsed.title == "Postgres replication"
    assert parsed.frontmatter == {"title": "Postgres replication"}
    assert parsed.size > 0


def test_parse_note_falls_back_to_h1(fixture_vault: Path) -> None:
    parsed = parse_note(fixture_vault / "mongo.md")
    assert parsed.title == "Mongo replica sets"


def test_parse_note_content_hash_changes_on_edit(tmp_path: Path) -> None:
    f = tmp_path / "n.md"
    f.write_text("# A\nhello\n")
    h1 = parse_note(f).content_hash
    f.write_text("# A\ngoodbye\n")
    h2 = parse_note(f).content_hash
    assert h1 != h2


def test_chunk_markdown_heading_path() -> None:
    body = "# Top\n\nIntro paragraph.\n\n## Sub\n\nDetail paragraph.\n"
    chunks = chunk_markdown(body)
    paths = [c.heading_path for c in chunks]
    assert "Top" in paths
    assert any(p == "Top > Sub" for p in paths)
    assert all(c.ord == i for i, c in enumerate(chunks))
