from pathlib import Path

import pytest
from lattice_api.config import Mode, Settings


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        mode=Mode.LOCAL,
        local_data_dir=tmp_path,
        embedding_provider="hash",
    )


@pytest.fixture
def fixture_vault(tmp_path: Path) -> Path:
    """A small vault with three notes covering distinct topics so search can be asserted."""

    root = tmp_path / "vault"
    root.mkdir()
    (root / "postgres.md").write_text(
        "---\ntitle: Postgres replication\n---\n"
        "# Postgres replication\n\n"
        "Physical replication ships WAL bytes. Logical replication uses replication slots\n"
        "to stream row-level changes downstream.\n\n"
        "## Slots\n\n"
        "Slots track replication progress and prevent WAL recycling.\n"
    )
    (root / "mongo.md").write_text(
        "# Mongo replica sets\n\n"
        "A replica set has a primary and secondaries that elect a new primary on failure.\n"
    )
    (root / "kafka.md").write_text(
        "# Kafka basics\n\nTopics are partitioned logs. Consumers read at their own offset.\n"
    )
    # Hidden directory — indexer should skip it.
    (root / ".obsidian").mkdir()
    (root / ".obsidian" / "config.md").write_text("# do not index\n")
    return root
