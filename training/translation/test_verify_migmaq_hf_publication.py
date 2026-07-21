from types import SimpleNamespace

from verify_migmaq_hf_publication import lfs_sha256, resolve_tag_revision


def test_lfs_sha256_accepts_hub_object_and_dictionary() -> None:
    assert lfs_sha256(SimpleNamespace(lfs=SimpleNamespace(sha256="abc"))) == "abc"
    assert lfs_sha256(SimpleNamespace(lfs={"sha256": "def"})) == "def"
    assert lfs_sha256(SimpleNamespace(lfs=None)) is None


def test_resolve_tag_revision_dereferences_annotated_tag() -> None:
    class FakeApi:
        def repo_info(self, repo_id, *, repo_type, revision):
            assert repo_id == "owner/repo"
            assert repo_type == "model"
            assert revision == "v3.3.0"
            return SimpleNamespace(sha="resolved-commit-sha")

    assert (
        resolve_tag_revision(FakeApi(), "owner/repo", "model", "v3.3.0")
        == "resolved-commit-sha"
    )
