#!/usr/bin/env python3
"""Idempotent watercolour-asset generator for MobTranslate (gpt-image-2).

Manifest-driven: each asset is generated once and cached to disk; re-runs skip
existing files. This is the reusable generate+cache pipeline. Reads the OpenAI
key from /opt/mobtranslate/web.env.
"""
import json, base64, subprocess, urllib.request, os, sys

OUT = os.environ.get("OUT", "/mnt/donto-data/workspace/mobtranslate.com/mobile/assets/images/gen")
os.makedirs(OUT, exist_ok=True)

def key():
    r = subprocess.run(["sudo","grep","-E","^OPENAI_API_KEY=","/opt/mobtranslate/web.env"],
                       capture_output=True, text=True).stdout
    return r.split("=",1)[1].strip().strip('"')

K = key()

# Shared style so the whole set feels like one painter's hand.
STYLE = ("Soft, calm watercolour illustration. Loose painterly washes on visible cream "
         "paper texture, gentle bleeds, muted earthy palette, lots of negative space, "
         "light and airy, editorial and serene. Absolutely NO text, NO words, NO labels, "
         "NO people, NO animals, NO borders or frames.")

MAP_STYLE = ("Soft watercolour stylised MAP, gentle top-down aerial view of Country and "
             "coastline, hand-painted landforms in loose washes on cream paper. " +
             "Muted and elegant. NO text, NO labels, NO place names, NO grid, NO compass, "
             "NO pins, NO borders.")

MANIFEST = [
    # name, size, prompt
    ("wotd-default", "1536x1024",
     "Wet-season rain drifting over misty Far North Queensland rainforest hills and a "
     "quiet river, eucalyptus sage-green with warm cream and soft ochre. " + STYLE),

    # Explore-language Country vignettes (square thumbnails)
    ("lang-kuku_yalanji", "1024x1024",
     "Far North Queensland: lush rainforest meeting turquoise reef sea, deep "
     "eucalyptus greens and soft teal. " + STYLE),
    ("lang-anindilyakwa", "1024x1024",
     "Groote Eylandt island archipelago in the Gulf, turquoise sea, warm sandstone "
     "ochre headlands and pale sand. " + STYLE),
    ("lang-migmaq", "1024x1024",
     "Mi'kma'ki eastern Canada coastline, muted autumn — sage, slate blue water, soft "
     "rust and grey. " + STYLE),
    ("lang-wajarri", "1024x1024",
     "Pilbara Western Australia, red ochre earth, golden spinifex plains and dusty "
     "green, ancient gorges. " + STYLE),

    # Watercolour Country maps for the Map tab + hero (landscape)
    ("map-kuku_yalanji", "1536x1024",
     "the Far North Queensland coast and Daintree region around Cape Tribulation, "
     "rainforest green inland and turquoise reef sea. " + MAP_STYLE),
    ("map-anindilyakwa", "1536x1024",
     "Groote Eylandt and the islands of the western Gulf of Carpentaria, ochre land "
     "and turquoise sea. " + MAP_STYLE),
    ("map-migmaq", "1536x1024",
     "the Atlantic coast of Mi'kma'ki (Nova Scotia / Gaspe), green land and slate-blue "
     "sea with inlets. " + MAP_STYLE),
    ("map-wajarri", "1536x1024",
     "the inland Pilbara / Murchison region of Western Australia, red ochre earth with "
     "pale river lines. " + MAP_STYLE),
]

def gen(name, size, prompt):
    path = os.path.join(OUT, name + ".png")
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        print("skip (cached):", name); return True
    body = json.dumps({"model":"gpt-image-2","prompt":prompt,"size":size,"n":1,
                       "quality":"high"}).encode()
    req = urllib.request.Request("https://api.openai.com/v1/images/generations", data=body,
        headers={"Authorization":f"Bearer {K}","Content-Type":"application/json","User-Agent":"curl/8.5.0"})
    try:
        r = urllib.request.urlopen(req, timeout=240)
        d = json.load(r); item = d["data"][0]
        raw = base64.b64decode(item["b64_json"]) if item.get("b64_json") else urllib.request.urlopen(item["url"]).read()
        open(path,"wb").write(raw)
        print("OK:", name, len(raw), "bytes"); return True
    except urllib.error.HTTPError as e:
        print("HTTPError", name, e.code, e.read().decode()[:300]); return False
    except Exception as e:
        print("ERR", name, repr(e)); return False

ok = 0
for name, size, prompt in MANIFEST:
    if gen(name, size, prompt): ok += 1
print(f"\nDONE {ok}/{len(MANIFEST)} -> {OUT}")
