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
