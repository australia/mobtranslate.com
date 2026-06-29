#!/usr/bin/env python3
"""Generate Play Store phone screenshots (1080x1920) as faithful mockups of the
MobTranslate app screens. Output SVGs to brand/shots/, rendered to PNG by the caller."""
import os, html

W, H = 1080, 1920
OCHRE = "#B45E2A"; OCHRE_D = "#8E481F"; INK = "#2A211B"; MUTED = "#6F6256"
BG = "#FAF5EF"; SURF = "#FFFFFF"; BORDER = "#E7DCD0"; SOFT = "#F3E4D6"; GOLD = "#E08A3C"; WHITE="#FFFFFF"
F = "Inter, sans-serif"

def esc(s): return html.escape(s, quote=True)

def text(x, y, s, size, color, weight="400", anchor="start"):
    return f'<text x="{x}" y="{y}" font-family="{F}" font-size="{size}" font-weight="{weight}" fill="{color}" text-anchor="{anchor}">{esc(s)}</text>'

def rect(x, y, w, h, r, fill, stroke=None, sw=0):
    s = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ''
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"{s}/>'

def speaker(cx, cy, rr=44):
    # small ochre speaker pill
    return (f'<circle cx="{cx}" cy="{cy}" r="{rr}" fill="{SOFT}"/>'
            f'<path d="M{cx-16} {cy-8} h10 l14 -12 v40 l-14 -12 h-10 z" fill="{OCHRE}"/>'
            f'<path d="M{cx+14} {cy-12} a18 18 0 0 1 0 24" stroke="{OCHRE}" stroke-width="5" fill="none"/>')

def mark(x, y, s):
    # the two-bubble mark scaled, on its own ochre tile
    return (f'<g transform="translate({x},{y}) scale({s})">'
            f'{rect(0,0,512,512,116,"url(#tile)")}'
            f'{rect(78,126,300,172,46,WHITE)}<path d="M150 286 L132 356 L196 290 Z" fill="{WHITE}"/>'
            f'{rect(246,232,190,150,50,OCHRE_D)}<path d="M386 372 L406 432 L346 376 Z" fill="{OCHRE_D}"/>'
            f'{rect(262,248,158,118,40,GOLD)}<path d="M388 358 L402 402 L352 362 Z" fill="{GOLD}"/></g>')

TABS = [("Translate","chat"),("Words","book"),("Record","mic"),("Keyboard","kbd"),("Account","person")]

def tab_icon(kind, cx, cy, color):
    if kind=="chat":
        return f'{rect(cx-20,cy-16,30,22,7,color)}{rect(cx-2,cy-6,24,18,6,color)}'
    if kind=="book":
        return f'{rect(cx-18,cy-18,36,36,5,color)}<rect x="{cx-2}" y="{cy-18}" width="4" height="36" fill="{BG}"/>'
    if kind=="mic":
        return f'{rect(cx-9,cy-20,18,28,9,color)}<path d="M{cx-16} {cy} a16 16 0 0 0 32 0" stroke="{color}" stroke-width="5" fill="none"/><rect x="{cx-2}" y="{cy+14}" width="4" height="10" fill="{color}"/>'
    if kind=="kbd":
        out=rect(cx-22,cy-14,44,28,5,color)
        return out
    # person
    return f'<circle cx="{cx}" cy="{cy-10}" r="10" fill="{color}"/><path d="M{cx-18} {cy+18} a18 16 0 0 1 36 0 z" fill="{color}"/>'

def tabbar(active):
    y0 = H-150
    parts=[rect(0,y0,W,150,0,SURF), f'<line x1="0" y1="{y0}" x2="{W}" y2="{y0}" stroke="{BORDER}" stroke-width="2"/>']
    cw = W/len(TABS)
    for i,(label,kind) in enumerate(TABS):
        cx = int(cw*i + cw/2); cy = y0+52
        col = OCHRE if i==active else MUTED
        parts.append(tab_icon(kind,cx,cy,col))
        parts.append(text(cx, y0+104, label, 24, col, "600", "middle"))
    return "".join(parts)

def header(eyebrow, title, sub):
    p=[text(60,150,eyebrow.upper(),28,OCHRE,"700")]
    p.append(text(58,210,title,58,INK,"800"))
    if sub: p.append(text(60,260,sub,32,MUTED,"500"))
    return "".join(p)

def pills(items, active_idx, y):
    out=[]; x=58
    for i,it in enumerate(items):
        w = 40 + len(it)*19
        if i==active_idx:
            out.append(rect(x,y,w,72,36,OCHRE)); out.append(text(x+w/2,y+47,it,30,WHITE,"700","middle"))
        else:
            out.append(rect(x,y,w,72,36,SURF,BORDER,2)); out.append(text(x+w/2,y+47,it,30,INK,"700","middle"))
        x+=w+18
    return "".join(out)

def frame(active, body):
    return f'''<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="tile" x1="256" y1="0" x2="256" y2="512" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#C56A30"/><stop offset="1" stop-color="#A04A1A"/></linearGradient></defs>
{rect(0,0,W,H,0,BG)}
{text(60,70,"9:41",30,INK,"700")}
{rect(W-150,52,30,24,6,INK)}{rect(W-110,52,30,24,6,INK)}{rect(W-70,52,30,24,6,INK)}
{body}
{tabbar(active)}
</svg>'''

shots = {}

# 1. Translate
b = [header("Translate","Translate","Type English, get Kuku Yalanji.")]
b.append(pills(["Kuku Yalanji","Anindilyakwa","Wajarri"],0,310))
b.append(rect(58,410,W-116,150,18,SURF,BORDER,2)); b.append(text(86,500,"Hello",40,INK,"500"))
b.append(rect(58,590,W-116,108,16,OCHRE)); b.append(text(W/2,658,"Translate  →",36,WHITE,"700","middle"))
b.append(rect(58,740,W-116,330,22,SURF,BORDER,2))
b.append(text(90,810,"KUKU YALANJI",26,OCHRE,"700"))
b.append(text(90,895,"Kawku",70,INK,"800")); b.append(speaker(W-150,870,52))
b.append(text(90,975,"A greeting — hello.",34,MUTED,"500"))
shots["translate"]=frame(0,"".join(b))

# 2. Words
b=[header("Words","Words","Search the dictionary.")]
b.append(rect(58,300,W-116,96,16,SURF,BORDER,2)); b.append(text(96,360,"water",36,INK,"500"))
def row(y,word,mean):
    return (rect(58,y,W-116,150,16,SURF,BORDER,2)+text(90,y+62,word,42,INK,"700")+
            text(90,y+108,mean,32,MUTED,"500")+speaker(W-150,y+75,48))
b.append(row(440,"bana","water, fresh water"))
b.append(row(610,"bana-bana","wet, watery"))
b.append(row(780,"yaba","river, creek"))
shots["words"]=frame(1,"".join(b))

# 3. Record
b=[header("Record","Record a sentence","Type it, then record yourself.")]
b.append(pills(["Kuku Yalanji","Anindilyakwa"],0,310))
b.append(text(60,430,"SENTENCE",26,INK,"700"))
b.append(rect(58,455,W-116,200,18,SURF,BORDER,2))
b.append(text(86,525,"Ngayu bama Kuku Yalanji.",36,INK,"500"))
b.append(text(86,580,"(I am a Kuku Yalanji person.)",30,MUTED,"400"))
b.append(rect(58,700,W-116,260,24,OCHRE))
b.append(f'<g transform="translate({W/2-44},760)">{rect(-9,-4,18,40,9,WHITE)}<path d="M-30 30 a30 30 0 0 0 60 0" stroke="{WHITE}" stroke-width="7" fill="none"/><rect x="-3" y="52" width="6" height="16" fill="{WHITE}"/></g>')
b.append(text(W/2,930,"Record",44,WHITE,"800","middle"))
shots["record"]=frame(2,"".join(b))

# 4. Keyboard
b=[header("Keyboard","Language keyboard","Type your language anywhere.")]
b.append(rect(58,320,W-116,440,22,SURF,BORDER,2))
def step(y,n,t1,t2=""):
    out=f'<circle cx="118" cy="{y}" r="30" fill="{SOFT}"/>'+text(118,y+11,n,32,OCHRE,"800","middle")
    out+=text(176,y-2,t1,32,INK,"600")
    if t2: out+=text(176,y+40,t2,32,INK,"600")
    return out
b.append(step(400,"1","Turn on MobTranslate Keyboard","in settings."))
b.append(step(540,"2","Switch keyboards to","MobTranslate."))
b.append(step(680,"3","Type English, tap the","language word."))
b.append(rect(58,800,W-116,108,16,OCHRE)); b.append(text(W/2,868,"Open keyboard settings",34,WHITE,"700","middle"))
# mini keyboard preview
ky=1000
b.append(rect(40,ky,W-80,360,20,"#E7E0D8"))
b.append(rect(70,ky+20,200,54,27,OCHRE)); b.append(text(170,ky+56,"Kuku Yalanji ▾",24,WHITE,"700","middle"))
b.append(rect(290,ky+20,130,54,27,GOLD)); b.append(text(355,ky+56,"bana",26,WHITE,"800","middle"))
for r,row_keys in enumerate(["qwertyuiop","asdfghjkl","zxcvbnm"]):
    kx=60
    for ch in row_keys:
        b.append(rect(kx,ky+95+r*78,86,66,10,WHITE)); b.append(text(kx+43,ky+138+r*78,ch,30,INK,"600","middle"))
        kx+=96
shots["keyboard"]=frame(3,"".join(b))

outdir = os.path.join(os.path.dirname(__file__), "shots")
os.makedirs(outdir, exist_ok=True)
for name, svg in shots.items():
    with open(os.path.join(outdir, f"{name}.svg"), "w") as fh:
        fh.write(svg)
    print("wrote", name)
