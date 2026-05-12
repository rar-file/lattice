from click.testing import CliRunner
from lattice_cli.main import cli


def test_help() -> None:
    runner = CliRunner()
    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0
    assert "lattice" in result.output.lower()


def test_hello() -> None:
    runner = CliRunner()
    result = runner.invoke(cli, ["hello"])
    assert result.exit_code == 0
    assert "lattice" in result.output.lower()


def test_subcommands_registered() -> None:
    """All M2-M4 subcommands should appear in --help."""
    runner = CliRunner()
    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0
    out = result.output.lower()
    for expected in [
        "open",
        "search",
        "chat",
        "mcp",
        "login",
        "logout",
        "sync",
        "capture",
        "synthesize",
        "serve",
    ]:
        assert expected in out, f"{expected!r} missing from CLI help"


def test_sync_subgroup_lists_commands() -> None:
    runner = CliRunner()
    result = runner.invoke(cli, ["sync", "--help"])
    assert result.exit_code == 0
    out = result.output.lower()
    for expected in ["enable", "disable", "status", "push", "pull"]:
        assert expected in out


def test_search_without_vault_exits_2(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("LATTICE_LOCAL_DATA_DIR", str(tmp_path))
    runner = CliRunner()
    result = runner.invoke(cli, ["search", "anything"])
    assert result.exit_code == 2


def test_capture_without_vault_exits_2(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("LATTICE_LOCAL_DATA_DIR", str(tmp_path))
    runner = CliRunner()
    result = runner.invoke(cli, ["capture", "hello"])
    assert result.exit_code == 2


def test_synthesize_without_vault_exits_2(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("LATTICE_LOCAL_DATA_DIR", str(tmp_path))
    runner = CliRunner()
    result = runner.invoke(cli, ["synthesize"])
    assert result.exit_code == 2
