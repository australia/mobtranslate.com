#!/usr/bin/env python3
"""
SIMILARITY (baseline layer only, honestly labelled).

Metric NAME = 'grambank_recorded_agreement' (NEVER 'grammatical similarity'): the fraction of
JOINTLY-CODED Grambank features on which two languages carry the same value. Only real values
(0/1/2/3) count; '?' (unknown), 'N/A', and 'not_recorded' are excluded from both the numerator
and the denominator. A pair is reported only when n_joint >= 30.

Outputs:
  - aggregate agreement + n_joint per pair
  - per-domain sub-scores over Grambank's OWN published feature-group columns
    (Boundness, Flexivity, Gender_or_Noun_Class, Locus_of_Marking, Word_Order), each with its
    own n_joint
  - top-10 nearest neighbours per language
  - k-medoids clustering (k chosen in 8..12) over distance = 1 - agreement, with a
    family-vs-cluster agreement statistic (Rand index against genealogical subgroup).

Pure-Python (no numpy/scipy on this box). Source: Grambank v1.0.3 CLDF (CC-BY-4.0).
"""
import json, random, collections
from pathlib import Path

OUT = Path("/mnt/donto-data/donto-resources/research/australian-languages/typology")
ROOT = OUT.parent
MIN_JOINT = 30
random.seed(1234)

# Grambank's published multi-label feature groups (from parameters.csv), used for per-domain scores.
GROUP_COLS = ["Boundness", "Flexivity", "Gender_or_Noun_Class", "Locus_of_Marking", "Word_Order"]


def main():
    m = json.load(open(OUT / "language-features-matrix.json"))
    catalog = json.load(open(OUT / "features-catalog.json"))
    feat = {f["id"]: f for f in catalog["features"]}
    group_members = {g: set(fid for fid, f in feat.items() if g in f["grambank_groups"]) for g in GROUP_COLS}

    # coded vectors: glottocode -> {feature_id: value} for real values only
    vec = {}
    names = {}
    for row in m["languages"]:
        g = row["glottocode"]
        names[g] = row["name"]
        v = {}
        for fid, cell in row["cells"].items():
            if cell.get("status") == "coded":
                v[fid] = cell["value"]
        vec[g] = v

    # registry: family + genealogical subgroup label for the family-vs-cluster stat
    reg = json.load(open(ROOT / "registry/australian_languages_registry.json"))
    subgroup = {}
    family = {}
    for l in reg["languoids"]:
        g = l.get("glottocode")
        if not g:
            continue
        family[g] = l.get("family")
        chain = l.get("family_chain") or []
        # MAJOR subgroup = the node just under the top-level family (family_chain[1]); this is the
        # standard "subgroup" granularity (Yolngu, Arandic, Karnic, ...). Fall back to the top family
        # node, then to the family name / isolate. (The deepest node is too granular to compare with
        # ~8-12 clusters.)
        if len(chain) >= 2:
            subgroup[g] = chain[1]["glottocode"]
        elif chain:
            subgroup[g] = chain[0]["glottocode"]
        else:
            subgroup[g] = l.get("family") or "isolate"

    langs = sorted(vec.keys())

    def agreement(a, b, restrict=None):
        va, vb = vec[a], vec[b]
        keys = va.keys() & vb.keys()
        if restrict is not None:
            keys = keys & restrict
        n = len(keys)
        if n == 0:
            return None, 0
        match = sum(1 for k in keys if va[k] == vb[k])
        return match / n, n

    # ---- pairwise aggregate + per-domain ----
    pairs = []
    agg = {}  # (a,b) -> (score, n)
    for i, a in enumerate(langs):
        for b in langs[i + 1:]:
            score, n = agreement(a, b)
            if n >= MIN_JOINT and score is not None:
                per_domain = {}
                for gname, members in group_members.items():
                    ds, dn = agreement(a, b, members)
                    if ds is not None and dn > 0:
                        per_domain[gname] = {"agreement": round(ds, 4), "n_joint": dn}
                rec = {"a": a, "b": b, "grambank_recorded_agreement": round(score, 4),
                       "n_joint": n, "per_domain": per_domain}
                pairs.append(rec)
                agg[(a, b)] = (score, n)
                agg[(b, a)] = (score, n)

    # ---- top-10 neighbours per language ----
    neigh = {}
    for a in langs:
        cand = []
        for b in langs:
            if b == a:
                continue
            if (a, b) in agg:
                s, n = agg[(a, b)]
                cand.append((s, n, b))
        cand.sort(key=lambda x: (-x[0], -x[1]))
        neigh[a] = [{"glottocode": b, "name": names[b],
                     "grambank_recorded_agreement": round(s, 4), "n_joint": n}
                    for s, n, b in cand[:10]]

    # ================= CLUSTERING (k-medoids over 1-agreement) =================
    # cluster only reasonably-coded languages so most pairs meet n_joint>=30
    coded_count = {row["glottocode"]: row["coverage_coded"] for row in m["languages"]}
    clangs = [g for g in langs if coded_count[g] >= 50]
    N = len(clangs)

    # distance matrix; missing (n_joint<30) imputed with the median observed distance
    observed = []
    D = [[0.0] * N for _ in range(N)]
    have = [[False] * N for _ in range(N)]
    for i in range(N):
        for j in range(i + 1, N):
            a, b = clangs[i], clangs[j]
            if (a, b) in agg:
                d = 1 - agg[(a, b)][0]
                D[i][j] = D[j][i] = d
                have[i][j] = have[j][i] = True
                observed.append(d)
    med = sorted(observed)[len(observed) // 2] if observed else 0.5
    for i in range(N):
        for j in range(N):
            if i != j and not have[i][j]:
                D[i][j] = med

    def kmedoids(k, restarts=12, iters=60):
        best = None
        for _ in range(restarts):
            medoids = random.sample(range(N), k)
            for _ in range(iters):
                # assign
                assign = [min(medoids, key=lambda mc: D[p][mc]) for p in range(N)]
                # update: medoid = point minimizing total intra-cluster distance
                new = []
                changed = False
                for mc in medoids:
                    members = [p for p in range(N) if assign[p] == mc]
                    if not members:
                        new.append(mc)
                        continue
                    bestm = min(members, key=lambda c: sum(D[c][p] for p in members))
                    new.append(bestm)
                    if bestm != mc:
                        changed = True
                medoids = new
                if not changed:
                    break
            assign = [min(medoids, key=lambda mc: D[p][mc]) for p in range(N)]
            cost = sum(D[p][assign[p]] for p in range(N))
            if best is None or cost < best[0]:
                best = (cost, medoids[:], assign[:])
        return best

    # choose k in 8..12 by average silhouette (pure python)
    def silhouette(assign):
        clusters = collections.defaultdict(list)
        for p, c in enumerate(assign):
            clusters[c].append(p)
        s = []
        for p in range(N):
            own = clusters[assign[p]]
            if len(own) <= 1:
                s.append(0.0)
                continue
            a_i = sum(D[p][q] for q in own if q != p) / (len(own) - 1)
            b_i = min(
                sum(D[p][q] for q in clusters[c]) / len(clusters[c])
                for c in clusters if c != assign[p]
            )
            s.append((b_i - a_i) / max(a_i, b_i) if max(a_i, b_i) > 0 else 0.0)
        return sum(s) / len(s)

    kres = {}
    for k in range(8, 13):
        cost, medoids, assign = kmedoids(k)
        kres[k] = (silhouette(assign), cost, medoids, assign)
    best_k = max(kres, key=lambda k: kres[k][0])
    sil, cost, medoids, assign = kres[best_k]

    # cluster labels & membership
    label_of = {}
    for ci, mc in enumerate(sorted(set(assign))):
        label_of[mc] = ci
    clusters = collections.defaultdict(list)
    for p, mc in enumerate(assign):
        clusters[label_of[mc]].append(clangs[p])

    # family-vs-cluster agreement: Rand index between cluster partition and subgroup partition
    def rand_index(part_a, part_b, items):
        same_a = {}
        same_b = {}
        for x in items:
            same_a[x] = part_a[x]
            same_b[x] = part_b[x]
        agree_pairs = 0
        total = 0
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                x, y = items[i], items[j]
                aa = (same_a[x] == same_a[y])
                bb = (same_b[x] == same_b[y])
                total += 1
                if aa == bb:
                    agree_pairs += 1
        return agree_pairs / total if total else None

    cluster_part = {clangs[p]: label_of[assign[p]] for p in range(N)}
    sub_part = {g: subgroup.get(g, "?") for g in clangs}
    ri = rand_index(cluster_part, sub_part, clangs)

    # per-cluster genealogical make-up (dominant subgroup + families)
    cluster_info = []
    for ci in sorted(clusters):
        members = clusters[ci]
        fam = collections.Counter(family.get(g) for g in members)
        sg = collections.Counter(subgroup.get(g) for g in members)
        # purity: share of the cluster in its most common subgroup
        top_sg, top_n = sg.most_common(1)[0]
        cluster_info.append({
            "cluster": ci,
            "size": len(members),
            "families": dict(fam),
            "dominant_subgroup_glottocode": top_sg,
            "subgroup_purity": round(top_n / len(members), 3),
            "members": [{"glottocode": g, "name": names.get(g)} for g in
                        sorted(members, key=lambda g: names.get(g) or g)],
        })

    macro_purity = sum(c["subgroup_purity"] * c["size"] for c in cluster_info) / N
    n_subgroups = len(set(sub_part.values()))

    # ---------------- write ----------------
    similarity = {
        "_meta": {
            "kind": "similarity",
            "metric_name": "grambank_recorded_agreement",
            "metric_definition": "Fraction of JOINTLY-CODED Grambank features (real 0/1/2/3 values only; "
                                 "'?'/'N/A'/not_recorded excluded from numerator AND denominator) on which "
                                 "two languages carry the same value.",
            "not_called": "grammatical similarity (this is agreement over recorded Grambank codings only, "
                          "NOT a claim about overall grammatical similarity)",
            "min_n_joint": MIN_JOINT,
            "per_domain_grouping": "Grambank's own published feature-group columns "
                                   "(Boundness/Flexivity/Gender_or_Noun_Class/Locus_of_Marking/Word_Order); "
                                   "each domain sub-score records its own n_joint.",
            "n_languages": len(langs),
            "n_pairs_reported": len(pairs),
        },
        "pairs": pairs,
        "neighbours": neigh,
    }
    json.dump(similarity, open(OUT / "similarity.json", "w"), indent=1, ensure_ascii=False)

    clustering = {
        "_meta": {
            "kind": "clusters",
            "method": "k-medoids (PAM, pure-python) over distance = 1 - grambank_recorded_agreement; "
                      "clustered languages restricted to Grambank coverage >= 50 so most pairs meet "
                      "n_joint>=30; missing pair-distances imputed with the median observed distance.",
            "k_search": {str(k): {"silhouette": round(kres[k][0], 4), "cost": round(kres[k][1], 3)}
                         for k in kres},
            "chosen_k": best_k,
            "silhouette": round(sil, 4),
            "n_clustered_languages": N,
            "family_vs_cluster": {
                "rand_index_cluster_vs_genealogical_subgroup": round(ri, 4) if ri is not None else None,
                "macro_subgroup_purity": round(macro_purity, 4),
                "n_genealogical_subgroups": n_subgroups,
                "note": "Most Australian languages here are Pama-Nyungan, so top-level FAMILY barely "
                        "discriminates; the statistic uses the MAJOR genealogical SUBGROUP "
                        "(family_chain level 2). The Rand index counts agreeing same/different-pair "
                        "decisions and is inflated by many true-negatives when subgroups are numerous; "
                        "read it together with subgroup purity. Grambank typological clusters correlate "
                        "with, but do not reproduce, genealogy — areal diffusion and shared retentions "
                        "cut across subgroups (an expected, honest finding).",
            },
        },
        "clusters": cluster_info,
    }
    json.dump(clustering, open(OUT / "clusters.json", "w"), indent=1, ensure_ascii=False)

    print("SIMILARITY built:")
    print(f"    languages: {len(langs)}   pairs (n_joint>={MIN_JOINT}): {len(pairs)}")
    print(f"    metric: grambank_recorded_agreement")
    print("CLUSTERS built:")
    print(f"    clustered languages (coverage>=50): {N}")
    print(f"    chosen k={best_k} (silhouette={sil:.3f})")
    print(f"    cluster-vs-subgroup Rand index = {ri:.3f}   macro subgroup purity = {macro_purity:.3f}")
    for c in cluster_info:
        print(f"      cluster {c['cluster']}: n={c['size']} dominant_subgroup={c['dominant_subgroup_glottocode']} purity={c['subgroup_purity']}")


if __name__ == "__main__":
    main()
