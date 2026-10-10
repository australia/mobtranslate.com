#!/usr/bin/env python3
"""Fetch open-licence (CC0 / CC BY / CC BY-SA) research-grade iNaturalist photos for Country pages.

Usage:
  python3 -I tools/country/inat_images.py plan              # print slug -> taxon mapping and hit counts, no downloads
  python3 -I tools/country/inat_images.py fetch [slug ...]  # download + prepend to data/country/kuku_yalanji/images/<slug>.json

One photo per page, nearest to Karma Waters first (150 km, then 400, then 1200), research grade only,
photo licence CC0 / CC BY / CC BY-SA. Pages that already have an iNaturalist photo are skipped.
Every fetch is appended to INAT_FETCH_LOG (default: the images dir). Check the pictures by eye afterwards:
the taxon match is iNaturalist's fuzzy taxon_name search, so a genus query can return the wrong genus.
"""
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "apps/web/data/country/kuku_yalanji"
IMG_DIR = ROOT / "apps/web/public/country-img/kuku_yalanji"
LOG = Path(os.environ.get("INAT_FETCH_LOG", ROOT / "tools/country/inat-fetch-log.jsonl"))
LOG.parent.mkdir(parents=True, exist_ok=True)
LAT, LNG = -16.62, 144.60
RADII = [150, 400, 1200]  # km: near Karma Waters first, then north Queensland, then the north generally
LICENCES = {"cc0": "CC0-1.0", "cc-by": "CC-BY-4.0", "cc-by-sa": "CC-BY-SA-4.0"}
MAX_SIDE = 1400
UA = {"User-Agent": "mobtranslate-country/1.0 (Kuku Yalanji Country encyclopedia; contact via mobtranslate.com)"}

# Pages whose scientificName field is absent or too broad: an explicit taxon and a display name.
OVERRIDES = {
    "weeds-and-ferals": ("Cryptostegia grandiflora", "rubber vine"),
    "insects-and-grubs": ("Valanga irregularis", "giant grasshopper"),
    "fish-poison-plants": ("Barringtonia racemosa", "freshwater mangrove, a fish-poison tree"),
    "woodland": ("Corymbia dallachiana", "Dallachy's gum, a tree of the woodland"),
    "waterhole": ("Nymphaea gigantea", "giant water lily on a waterhole"),
    "paperbark": ("Melaleuca leucadendra", "weeping paperbark"),
    "fig": ("Ficus racemosa", "cluster fig"),
    "wild-plums": ("Planchonia careya", "cocky apple"),
    "snakes": ("Oxyuranus scutellatus", "coastal taipan"),
    "pythons": ("Morelia spilota", "carpet python"),
    "frogs": ("Litoria caerulea", "green tree frog"),
    "water-birds": ("Anhinga novaehollandiae", "Australasian darter"),
    "ducks-and-geese": ("Anseranas semipalmata", "magpie goose"),
    "cockatoos-and-parrots": ("Calyptorhynchus banksii", "red-tailed black cockatoo"),
    "kookaburras-and-kingfishers": ("Dacelo leachii", "blue-winged kookaburra"),
    "eagles-and-hawks": ("Aquila audax", "wedge-tailed eagle"),
    "pigeons-and-doves": ("Geophaps scripta", "squatter pigeon"),
    "bush-birds": ("Chlamydera nuchalis", "great bowerbird"),
    "brolga-and-cranes": ("Antigone rubicunda", "brolga"),
    "flying-foxes-and-bats": ("Pteropus scapulatus", "little red flying fox"),
    "dingo-and-dogs": ("Canis familiaris dingo", "dingo"),
    "pigs": ("Sus scrofa", "feral pig"),
    "archerfish-and-small-fish": ("Toxotes chatareus", "seven-spot archerfish"),
    "quolls-bandicoots-and-rats": ("Dasyurus hallucatus", "northern quoll"),
    "lizards": ("Chlamydosaurus kingii", "frilled lizard"),
    "termites-and-ant-beds": ("Amitermes laurensis", "termite mounds"),
    "wattles-and-grevilleas": ("Grevillea pteridifolia", "golden grevillea"),
    "wild-rice-and-grass-seed": ("Oryza australiensis", "Australian wild rice"),
    "river-red-gum": ("Eucalyptus camaldulensis", "river red gum"),
    "leichhardt-tree": ("Nauclea orientalis", "Leichhardt tree"),
    "mangroves": ("Rhizophora stylosa", "stilt mangrove"),
    "stingrays": ("Hemitrygon fluviorum", "estuary stingray"),
    "oysters": ("Saccostrea", "rock oyster"),
    "mussels": ("Velesunio", "freshwater mussel"),
    "water-lilies": ("Nymphaea", "native water lily"),
    "green-ants": ("Oecophylla smaragdina", "green ant"),
    "native-bees": ("Tetragonula", "stingless native bee"),
    "goanna": ("Varanus panoptes", "yellow-spotted monitor"),
    "wallaby": ("Notamacropus agilis", "agile wallaby"),
    "possums": ("Trichosurus vulpecula", "common brushtail possum"),
    "echidna": ("Tachyglossus aculeatus", "short-beaked echidna"),
    "freshwater-turtle": ("Emydura tanybaraga", "northern yellow-faced turtle"),
    "freshwater-crocodile": ("Crocodylus johnstoni", "freshwater crocodile"),
    "saltwater-crocodile": ("Crocodylus porosus", "saltwater crocodile"),
    "catfish": ("Neosilurus", "eel-tailed catfish"),
    "cherabin": ("Macrobrachium", "cherabin, freshwater prawn"),
    "eels": ("Anguilla reinhardtii", "long-finned eel"),
    "black-bream": ("Hephaestus fuliginosus", "sooty grunter"),
    "bloodwood": ("Corymbia clarksoniana", "Clarkson's bloodwood"),
    "cotton-tree": ("Bombax ceiba", "red silk-cotton tree"),
    "kurrajong": ("Brachychiton diversifolius", "northern kurrajong"),
    "blady-grass": ("Imperata cylindrica", "blady grass"),
    "wild-ginger": ("Curcuma australasica", "native turmeric, wild ginger"),
    "brown-cedar": ("Canarium australianum", "brown cedar"),
    "zamia": ("Cycas media", "zamia"),
    "yam": ("Dioscorea transversa", "pencil yam"),
    "pandanus": ("Pandanus spiralis", "screw pine"),
    "grass-tree": ("Xanthorrhoea johnsonii", "grass tree"),
    "lawyer-cane": ("Calamus australis", "lawyer cane"),
    "black-palm": ("Normanbya normanbyi", "black palm"),
    "red-cedar": ("Toona ciliata", "red cedar"),
    "stinging-tree": ("Dendrocnide moroides", "stinging tree"),
    "candlenut": ("Aleurites moluccanus", "candlenut"),
    "ironwood": ("Erythrophleum chlorostachys", "Cooktown ironwood"),
    "black-bean": ("Castanospermum australe", "black bean"),
    "witchetty-grub": ("Endoxyla", "witchetty grub moth"),
    "mud-crab": ("Scylla serrata", "mud crab"),
    "sea-turtle": ("Chelonia mydas", "green turtle"),
    "dugong": ("Dugong dugon", "dugong"),
    "barramundi": ("Lates calcarifer", "barramundi"),
    "saratoga": ("Scleropages jardinii", "Gulf saratoga"),
    "sleepy-cod": ("Oxyeleotris lineolata", "sleepy cod"),
    "spangled-perch": ("Leiopotherapon unicolor", "spangled perch"),
    "mouth-almighty": ("Glossamia aprion", "mouth almighty"),
    "scrub-turkey": ("Alectura lathami", "Australian brush-turkey"),
    "scrub-hen": ("Megapodius reinwardt", "orange-footed scrubfowl"),
    "cassowary": ("Casuarius casuarius", "southern cassowary"),
    "bustard": ("Ardeotis australis", "Australian bustard"),
}


def api(path, **params):
    url = "https://api.inaturalist.org/v1/" + path + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def candidates(taxon):
    """Research-grade, open-licence observations with photos, nearest radius first."""
    for radius in RADII:
        try:
            d = api("observations", taxon_name=taxon, photo_license="cc0,cc-by,cc-by-sa",
                    quality_grade="research", lat=LAT, lng=LNG, radius=radius, per_page=12,
                    order_by="votes", photos="true")
        except Exception as e:  # noqa: BLE001
            print("  api error", taxon, radius, e, file=sys.stderr)
            time.sleep(5)
            continue
        time.sleep(1.2)
        res = [r for r in d.get("results", []) if r.get("photos")]
        if res:
            return radius, d["total_results"], res
    return None, 0, []


def pick(results):
    """Prefer observations whose taxon is a species, with an open-licence photo and a place name."""
    for r in results:
        for p in r.get("photos", []):
            if p.get("license_code") in LICENCES and p.get("url"):
                return r, p
    return None, None


def fetch_image(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=90) as r:
        return Image.open(io.BytesIO(r.read()))


def save_webp(img, slug, name):
    img.load()
    img = img.convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    out_dir = IMG_DIR / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{name}.webp"
    img.save(out, "WEBP", quality=78, method=6)
    return f"/country-img/kuku_yalanji/{slug}/{name}.webp", img.width, img.height, out.stat().st_size


def mapping():
    m = {}
    for f in sorted(DATA.glob("*.json")):
        e = json.load(open(f))
        slug = e["slug"]
        if slug in OVERRIDES:
            m[slug] = OVERRIDES[slug] + (e["title"],)
            continue
        sci = e.get("scientificName") or ""
        mm = re.search(r"\b([A-Z][a-z]+ [a-z]+)\b", sci)
        if mm:
            m[slug] = (mm.group(1), e["title"].split(":")[0].split(",")[0].lower(), e["title"])
    return m


def tidy_place(s):
    """Reduce an iNaturalist place guess to a locality and state: no street numbers, plus codes or foreign country names."""
    if not s:
        return None
    s = re.sub(r"[^\x00-\x7f]+", "", s)
    s = re.sub(r"-QL\b", ", Queensland", s)
    s = re.sub(r"\b\d{4}\b", "", s)
    parts = []
    for part in re.split(r",\s*", s):
        part = part.strip()
        if not part or re.search(r"\d", part) or re.search(r"\+", part):
            continue
        if part.lower() in {"au", "australia", "australie", "australien", "austrlia"} or re.fullmatch(r"[A-Z]{1,3}", part):
            continue
        part = re.sub(r"\bQLD\b", "Queensland", part)
        part = re.sub(r"\b(St|Street|Rd|Road|Hwy|Highway|Ave|Avenue|Dr|Drive|Cres|Crescent)\b.*$", "", part).strip()
        if part and part not in parts:
            parts.append(part)
    if not parts:
        return None
    if "Queensland" not in parts and "Queensland" not in " ".join(parts):
        parts.append("Queensland")
    return ", ".join(parts[:3])


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "plan"
    only = set(sys.argv[2:])
    m = mapping()
    for slug, (taxon, common, title) in m.items():
        if only and slug not in only:
            continue
        existing = DATA / "images" / f"{slug}.json"
        if mode == "fetch" and existing.exists():
            cur = json.load(open(existing))
            if any("inaturalist" in (i.get("sourceUrl") or "") for i in cur["images"]):
                print(f"{slug}: already has an iNaturalist photo, skipping")
                continue
        radius, total, res = candidates(taxon)
        obs, photo = pick(res)
        if mode == "plan":
            print(f"{slug:32s} {taxon:34s} r={radius} hits={total} pick={obs['id'] if obs else '-'} {tidy_place(obs.get('place_guess')) if obs else ''}")
            continue
        if not obs:
            print(f"{slug}: no open-licence photo found for {taxon}")
            continue
        url = photo["url"].replace("square", "large")
        try:
            img = fetch_image(url)
        except Exception as e:  # noqa: BLE001
            print(f"{slug}: download failed {url} {e}")
            continue
        name = re.sub(r"[^a-z0-9]+", "-", taxon.lower()).strip("-")[:40] + "-inat"
        src, w, h, nbytes = save_webp(img, slug, name)
        attribution = photo.get("attribution") or "iNaturalist user"
        who = re.sub(r"^\(c\)\s*", "", attribution)
        who = re.sub(r",\s*(some|no) rights reserved.*$", "", who).strip()
        place = tidy_place(obs.get("place_guess"))
        when = (obs.get("observed_on") or "")[:4]
        sci = obs["taxon"]["name"]
        licence = LICENCES[photo["license_code"]]
        caption = f"{common[0].upper() + common[1:]} ({sci})" + (f", {place}" if place else "") + (f", {when}" if when else "") + f". Photograph by {who} on iNaturalist, licence {licence.replace('-', ' ', 1)}."
        entry = {
            "src": src, "width": w, "height": h,
            "alt": f"{common[0].upper() + common[1:]}, {sci}, photographed in the wild" + (f" near {place}" if place else ""),
            "caption": caption,
            "kind": "photo",
            "credit": f"Photograph: {who}, via iNaturalist (observation {obs['id']})",
            "licence": licence,
            "sourceUrl": f"https://www.inaturalist.org/observations/{obs['id']}",
        }
        if place:
            entry["location"] = place
        if existing.exists():
            cur = json.load(open(existing))
            cur["images"].insert(0, entry)
        else:
            cur = {"slug": slug, "images": [entry]}
        json.dump(cur, open(existing, "w"), ensure_ascii=False, indent=2)
        open(existing, "a").write("\n")
        with open(LOG, "a") as lf:
            lf.write(json.dumps({"slug": slug, "taxon": taxon, "observation": obs["id"], "photo": photo["id"], "licence": photo["license_code"], "attribution": attribution, "url": url, "radius": radius, "bytes": nbytes}) + "\n")
        print(f"{slug}: {sci} obs {obs['id']} {licence} {w}x{h} {nbytes // 1024} KB {place or ''}")
        time.sleep(1.0)


if __name__ == "__main__":
    main()
