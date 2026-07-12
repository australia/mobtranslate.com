#!/usr/bin/env python3
"""
Idempotent import of the typology layer into mobtranslate-pg (the app DB).

Generates a single transactional SQL load from the research-mount typology artifacts and applies
it via `docker exec -i mobtranslate-pg psql`. Idempotent: it (re)runs the DDL migration, then
TRUNCATEs and reloads the six typology_* reference tables inside ONE transaction (atomic; these
tables are owned wholly by this pipeline and re-derived from the artifacts — no dictionary or
substrate data is touched).

Storage decision (see README): the app's language data flows through mobtranslate-pg (Drizzle), so
the queryable/joinable store for the typology layer is DB tables. The /languages/[code] endpoint
reads a committed static snapshot (build_public_snapshot.py) to avoid request-time DB coupling and
avoid editing the shared Drizzle schema.ts; both derive from the same artifacts.

Usage: python3 import_typology.py            # generate + apply
       python3 import_typology.py --sql-only  # just write the SQL file, don't apply
"""
import json, subprocess, sys, collections
from pathlib import Path

ROOT = Path("/mnt/donto-data/donto-resources/research/australian-languages")
TYP = ROOT / "typology"
REPO = Path("/mnt/donto-data/workspace/mobtranslate.com")
MIGRATION = REPO / "apps/web/supabase/migrations/20260712000000_create_typology_layer.sql"
SQL_OUT = Path("/tmp/claude-1002/-home-ajax/16b33bda-5be9-4b7a-9abf-6056159b39f4/scratchpad/typology_load.sql")
DB_CONTAINER = "mobtranslate-pg"
DB_USER = "mobtranslate"
DB_NAME = "mobtranslate"


def lit(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def jlit(v):
    if v is None:
        return "NULL"
    return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"


def load(p):
    return json.load(open(TYP / p))


def main():
    matrix = load("language-features-matrix.json")
    fcat = load("features-catalog.json")
    wcat = load("wals-supplement-catalog.json")
    wmat = load("wals-supplement-matrix.json")
    acat = load("aus-extension-catalog.json")
    avals = load("aus-extension-values.json")
    cons = load("constructions.json")
    sim = load("similarity.json")
    clus = load("clusters.json")
    reg = json.load(open(ROOT / "registry/australian_languages_registry.json"))
    reg_by = {l["glottocode"]: l for l in reg["languoids"] if l.get("glottocode")}

    # dictionary links (mirror the snapshot resolution)
    snap_index = json.load(open(REPO / "apps/web/public/typology/index.json"))["languages"]
    dict_by = {r["glottocode"]: (r.get("has_dictionary"), r.get("dictionary_code")) for r in snap_index}

    gb_rows = {r["glottocode"]: r for r in matrix["languages"]}
    wals_rows = {r["glottocode"]: r for r in wmat["languages"]}
    aval_rows = {r["glottocode"]: r for r in avals["languages"]}
    cluster_of = {}
    for c in clus["clusters"]:
        for m in c["members"]:
            cluster_of[m["glottocode"]] = c["cluster"]
    cons_by = collections.defaultdict(list)
    for c in cons["constructions"]:
        cons_by[c["language"]].append(c)

    lines = []
    lines.append("BEGIN;")
    lines.append("TRUNCATE public.typology_languages, public.typology_features, "
                 "public.typology_language_features, public.typology_constructions, "
                 "public.typology_similarity, public.typology_clusters;")

    # ---- typology_languages ----
    all_glotto = sorted(set(gb_rows) | set(wals_rows) | set(aval_rows))
    for g in all_glotto:
        meta = reg_by.get(g, {})
        chain = meta.get("family_chain") or []
        sg_g = chain[1]["glottocode"] if len(chain) >= 2 else (chain[0]["glottocode"] if chain else None)
        sg_n = chain[1]["name"] if len(chain) >= 2 else (chain[0]["name"] if chain else meta.get("family"))
        gbr = gb_rows.get(g)
        wr = wals_rows.get(g)
        ar = aval_rows.get(g)
        aux_coded = sum(1 for c in ar["cells"].values() if c["value"] != "?") if ar else 0
        has_dict, dcode = dict_by.get(g, (False, None))
        lines.append(
            "INSERT INTO public.typology_languages (glottocode,name,iso639_3,family,"
            "subgroup_glottocode,subgroup_name,latitude,longitude,austlang_codes,endangerment,"
            "grambank_coded,grambank_total,wals_coded,aus_extension_coded,cluster,has_dictionary,"
            "dictionary_code) VALUES ("
            f"{lit(g)},{lit(meta.get('canonical_name'))},{lit(meta.get('iso639_3'))},"
            f"{lit(meta.get('family'))},{lit(sg_g)},{lit(sg_n)},"
            f"{lit(meta.get('latitude'))},{lit(meta.get('longitude'))},"
            f"{jlit(meta.get('austlang_codes', []))},{lit(meta.get('endangerment_aes_label'))},"
            f"{lit(gbr['coverage_coded'] if gbr else 0)},195,"
            f"{lit(wr['coverage_coded'] if wr else 0)},{lit(aux_coded)},"
            f"{lit(cluster_of.get(g))},{lit(bool(has_dict))},{lit(dcode)});"
        )

    # ---- typology_features (grambank + wals + aus_extension) ----
    for f in fcat["features"]:
        lines.append(
            "INSERT INTO public.typology_features (id,layer,name,gloss,value_space,domain,"
            "grambank_groups,multistate) VALUES ("
            f"{lit(f['id'])},'grambank',{lit(f['name'])},{lit(f['gloss'])},{jlit(f['value_space'])},"
            f"{lit(f['topic_domain'])},{jlit(f['grambank_groups'])},{lit(bool(f['multistate']))});"
        )
    for f in wcat["features"]:
        lines.append(
            "INSERT INTO public.typology_features (id,layer,name,value_space,domain) VALUES ("
            f"{lit(f['id'])},'wals',{lit(f['name'])},{jlit(f['value_space'])},{lit(f['wals_area'])});"
        )
    for f in acat["features"]:
        lines.append(
            "INSERT INTO public.typology_features (id,layer,name,gloss,coding_question,value_space,"
            "domain,derivation_source,coverage_langs) VALUES ("
            f"{lit(f['id'])},'aus_extension',{lit(f['name'])},{lit(f['gloss'])},"
            f"{lit(f['coding_question'])},{jlit(f['value_space'])},{lit(f['domain'])},"
            f"{lit(f['derivation_source'])},{lit(f['coded_languages'])});"
        )

    # ---- typology_language_features ----
    # grambank: store cells that Grambank actually has a row for (status coded/unknown/not_applicable);
    #           'not_recorded' cells are left ABSENT so unknown stays distinct from not-recorded.
    for g, row in gb_rows.items():
        for fid, cell in row["cells"].items():
            if cell["status"] == "not_recorded":
                continue
            lines.append(
                "INSERT INTO public.typology_language_features (glottocode,layer,feature_id,value,"
                f"status,comment) VALUES ({lit(g)},'grambank',{lit(fid)},{lit(cell['value'])},"
                f"{lit(cell['status'])},{lit(cell.get('comment'))});"
            )
    # wals: coded cells (value = human meaning)
    for g, row in wals_rows.items():
        for pid, cell in row["cells"].items():
            lines.append(
                "INSERT INTO public.typology_language_features (glottocode,layer,feature_id,value,"
                f"status) VALUES ({lit(g)},'wals',{lit(pid)},{lit(cell['value'])},'coded');"
            )
    # aus_extension: coded cells only (value != '?'); unknown/not-derivable left absent
    for g, row in aval_rows.items():
        for aid, cell in row["cells"].items():
            if cell["value"] == "?":
                continue
            lines.append(
                "INSERT INTO public.typology_language_features (glottocode,layer,feature_id,value,"
                f"status,derivation) VALUES ({lit(g)},'aus_extension',{lit(aid)},{lit(cell['value'])},"
                f"'coded',{lit(cell['derivation'])});"
            )

    # ---- typology_constructions ----
    for c in cons["constructions"]:
        lines.append(
            "INSERT INTO public.typology_constructions (id,glottocode,domain,construction_name,"
            "description,example,source,analyst_confidence,community_terminology,license) VALUES ("
            f"{lit(c['id'])},{lit(c['language'])},{lit(c['domain'])},{lit(c['construction_name'])},"
            f"{lit(c['description'])},{jlit(c['example'])},{jlit(c['source'])},"
            f"{lit(c['analyst_confidence'])},{lit(c['community_terminology'])},{lit(c['license'])});"
        )

    # ---- typology_similarity ----
    for p in sim["pairs"]:
        lines.append(
            "INSERT INTO public.typology_similarity (lang_a,lang_b,grambank_recorded_agreement,"
            "n_joint,per_domain) VALUES ("
            f"{lit(p['a'])},{lit(p['b'])},{lit(p['grambank_recorded_agreement'])},"
            f"{lit(p['n_joint'])},{jlit(p['per_domain'])});"
        )

    # ---- typology_clusters ----
    for c in clus["clusters"]:
        lines.append(
            "INSERT INTO public.typology_clusters (cluster,size,dominant_subgroup_glottocode,"
            "subgroup_purity,members) VALUES ("
            f"{lit(c['cluster'])},{lit(c['size'])},{lit(c['dominant_subgroup_glottocode'])},"
            f"{lit(c['subgroup_purity'])},{jlit(c['members'])});"
        )

    lines.append("COMMIT;")
    SQL_OUT.parent.mkdir(parents=True, exist_ok=True)
    SQL_OUT.write_text("\n".join(lines))
    print(f"Generated {len(lines)} SQL statements -> {SQL_OUT}")

    if "--sql-only" in sys.argv:
        return

    # 1) apply the DDL migration (idempotent)
    print("Applying DDL migration ...")
    ddl = MIGRATION.read_text()
    r = subprocess.run(
        ["sudo", "docker", "exec", "-i", DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME,
         "-v", "ON_ERROR_STOP=1", "-q"],
        input=ddl, text=True, capture_output=True)
    if r.returncode != 0:
        print("DDL FAILED:\n", r.stderr[-3000:])
        sys.exit(1)

    # 2) apply the data load
    print("Applying data load ...")
    r = subprocess.run(
        ["sudo", "docker", "exec", "-i", DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME,
         "-v", "ON_ERROR_STOP=1", "-q"],
        input=SQL_OUT.read_text(), text=True, capture_output=True)
    if r.returncode != 0:
        print("DATA LOAD FAILED:\n", r.stderr[-4000:])
        sys.exit(1)

    # 3) verify counts
    counts_sql = (
        "SELECT 'languages', count(*) FROM public.typology_languages "
        "UNION ALL SELECT 'features', count(*) FROM public.typology_features "
        "UNION ALL SELECT 'features_grambank', count(*) FROM public.typology_features WHERE layer='grambank' "
        "UNION ALL SELECT 'features_wals', count(*) FROM public.typology_features WHERE layer='wals' "
        "UNION ALL SELECT 'features_aus_ext', count(*) FROM public.typology_features WHERE layer='aus_extension' "
        "UNION ALL SELECT 'lang_features', count(*) FROM public.typology_language_features "
        "UNION ALL SELECT 'lf_unknown', count(*) FROM public.typology_language_features WHERE status='unknown' "
        "UNION ALL SELECT 'constructions', count(*) FROM public.typology_constructions "
        "UNION ALL SELECT 'similarity', count(*) FROM public.typology_similarity "
        "UNION ALL SELECT 'clusters', count(*) FROM public.typology_clusters;"
    )
    r = subprocess.run(
        ["sudo", "docker", "exec", "-i", DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-A", "-F", "\t"],
        input=counts_sql, text=True, capture_output=True)
    print("Row counts after load:")
    print(r.stdout)


if __name__ == "__main__":
    main()
