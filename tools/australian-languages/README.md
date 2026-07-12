# tools/australian-languages

Generator for the **master registry of Australian Aboriginal & Torres Strait Islander languoids** —
joins AIATSIS **AUSTLANG code ↔ Glottocode ↔ ISO 639-3** and enriches with family/subgroup chain,
coordinates, endangerment status (Glottolog AES), and Grambank / WALS typology coverage.

## `build_registry.py`

Pure Python stdlib, deterministic, idempotent. Reads four **CC-BY-4.0** open datasets and writes the
registry JSON/CSV + stats. It does **not** fetch anything — point it at a data dir that already holds
the downloaded CLDF/AUSTLANG files.

```bash
python3 build_registry.py --data-dir <DIR> [--out-dir <DIR>/registry]
```

`<DIR>` must contain:
```
glottolog/cldf/{languages,values,names}.csv     # Glottolog 5.3 CLDF (CC-BY-4.0)
grambank/cldf/{languages,values}.csv            # Grambank v1.0.3 CLDF (CC-BY-4.0)
wals/cldf/{languages,values}.csv                # WALS Online CLDF (CC-BY-4.0)
austlang/austlang_dataset.csv                   # AIATSIS AUSTLANG via data.gov.au (CC-BY-4.0)
```

Outputs: `australian_languages_registry.{json,csv}`, `austlang_unmapped.json`, `registry_stats.json`.

**Canonical data + downloads + full source/license provenance (sha256 per artifact):**
`/mnt/donto-data/donto-resources/research/australian-languages/` (`SOURCES.md`, `README.md`).
The registry data lives on the research mount (per the research-on-mount rule), not in this repo;
this directory holds only the reproducible generator.

### Join method
Glottolog CLDF does not carry the AIATSIS alphanumeric code, so AUSTLANG↔Glottocode is joined on the
datasets' own shared name strings (Glottolog ingested AIATSIS name-variants into `names.csv`), scored
with a confidence band + a haversine distance gate. See the module docstring and the research README
for details. Every mapping is auditable per row (`austlang_matches`); unmapped codes are never dropped.
