#!/usr/bin/env python3
"""Generates the static, crawlable site (index, project pages, notebook, sitemap, robots) from projects/."""
import os, re, json, html, shutil, subprocess, datetime
R='grok-builds'; BASE=f'https://fitzyracing1.github.io/{R}/'; GH='https://github.com/fitzyracing1/'
NOPAGES={'stampback','dilop-suit-plugins'}
ROOT=os.path.dirname(os.path.abspath(__file__)); P=os.path.join(ROOT,'projects'); OUT=os.path.join(ROOT,'site')
today=datetime.date.today().isoformat(); pages=[]
CSS="body{font:16px/1.6 system-ui,sans-serif;max-width:860px;margin:2rem auto;padding:0 1rem;color:#222}a{color:#0b57d0}img{max-width:100%}pre{background:#f5f5f5;padding:.8rem;overflow:auto}code{background:#f5f5f5}li{margin:.4rem 0}nav{margin-bottom:1rem}.card{border:1px solid #ddd;border-radius:8px;padding:1rem;margin:1rem 0}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:.3rem .5rem}"
def e(s): return html.escape(s,quote=True)
def head(title,desc,url,ld,typ='website'):
    return f'''<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title><meta name="description" content="{e(desc)}"><link rel="canonical" href="{url}">
<meta property="og:type" content="{typ}"><meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}"><meta property="og:url" content="{url}"><meta property="og:site_name" content="Grok Builds by Joshua Almeida"><meta name="twitter:card" content="summary">
<script type="application/ld+json">{json.dumps(ld)}</script>'''
def write(rel,content):
    f=os.path.join(OUT,rel); os.makedirs(os.path.dirname(f),exist_ok=True); open(f,'w').write(content); pages.append(BASE+rel.replace('index.html',''))
def info(s):
    md=open(os.path.join(P,s,'README.md')).read()
    t=re.search(r'^#\s+(.+)',md,re.M).group(1).strip()
    desc=''
    for para in re.split(r'\n\s*\n',md):
        p=para.strip()
        if not p or p.startswith(('#','!','**Live','**Repo','|','```','<','-','*Live')): continue
        desc=re.sub(r'[*_`]|\[([^\]]*)\]\([^)]*\)',lambda m:m.group(1) or '',' '.join(p.split()));break
    if len(desc)>200: desc=desc[:197].rsplit(' ',1)[0]+'…'
    return md,t,desc
if os.path.exists(OUT): shutil.rmtree(OUT)
projs=sorted(os.listdir(P)); meta={}
for s in projs:
    md,t,d=info(s); meta[s]=(t,d)
    body=subprocess.run(['pandoc','-f','gfm','-t','html'],input=md,capture_output=True,text=True,check=True).stdout
    def fix(m):
        a,u=m.group(1),m.group(2)
        if re.match(r'^(https?:|mailto:|#|/|data:)',u): return m.group(0)
        if a=='src': return f'src="../projects/{s}/{u}"'
        return f'href="{GH}{R}/blob/main/projects/{s}/{u}"'
    body=re.sub(r'(src|href)="([^"]*)"',fix,body)
    url=BASE+s+'/'; live=None if s in NOPAGES else f'https://fitzyracing1.github.io/{s}/'
    ld={"@context":"https://schema.org","@type":"SoftwareSourceCode","name":t,"description":d,"url":url,"codeRepository":GH+s,"license":"https://opensource.org/licenses/MIT","author":{"@type":"Person","name":"Joshua Almeida","url":"https://github.com/fitzyracing1"}}
    links=f'<a href="{GH}{s}">Original repo</a> · <a href="{GH}{R}/tree/main/projects/{s}">Source in this repo</a>'+(f' · <a href="{live}">Live demo</a>' if live else '')
    extra=f'<p><strong><a href="site/index.html">Browse all 22 Notebook entries (static HTML, KaTeX pre-rendered)</a></strong></p>' if s=='notebook' else ''
    write(f'{s}/index.html',f'<!doctype html><html lang="en"><head>{head(t+" · Grok Builds",d,url,ld)}<style>{CSS}</style></head><body><nav><a href="../">← All Grok Builds</a></nav><p>{links}</p>{extra}<main>{body}</main></body></html>')
# notebook static site
src=os.path.join(P,'notebook','_site'); dst=os.path.join(OUT,'notebook','site'); shutil.copytree(src,dst,dirs_exist_ok=True)
nb=[]
for f in sorted(os.listdir(dst)):
    if not f.endswith('.html'): continue
    fp=os.path.join(dst,f); h=open(fp).read()
    t=html.unescape(re.search(r'<title>(.*?)</title>',h,re.S).group(1)); m=re.search(r'name="description" content="([^"]*)"',h); d=html.unescape(m.group(1)) if m else t
    rel=f'notebook/site/{f}'; url=BASE+rel.replace('index.html','')
    if f=='index.html': ld={"@context":"https://schema.org","@type":"CollectionPage","name":t,"description":d,"url":url}
    else:
        nb.append((f,t,d)); ld={"@context":"https://schema.org","@type":"Article","headline":t,"description":d,"url":url,"author":{"@type":"Person","name":"Joshua Almeida"},"isPartOf":BASE+"notebook/"}
    h=re.sub(r'<title>.*?</title>\s*(<meta name="description"[^>]*>)?','',h,count=1,flags=re.S)
    h=h.replace('<head>','<head>\n'+head(t,d,url,ld,'article' if f!='index.html' else 'website').replace('<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n',''),1)
    open(fp,'w').write(h); pages.append(url)
# root index
cards=''.join(f'<div class="card"><h2><a href="{s}/">{e(meta[s][0])}</a></h2><p>{e(meta[s][1])}</p><p><a href="{s}/">Project page</a> · <a href="{GH}{s}">Original repo</a>'+('' if s in NOPAGES else f' · <a href="https://fitzyracing1.github.io/{s}/">Live demo</a>')+'</p></div>' for s in projs)
nbl=''.join(f'<li><a href="notebook/site/{f}">{e(t)}</a> — {e(d)}</li>' for f,t,d in nb)
ld={"@context":"https://schema.org","@type":"CollectionPage","name":"Grok Builds","url":BASE,"hasPart":[{"@type":"SoftwareSourceCode","name":meta[s][0],"url":BASE+s+'/',"codeRepository":GH+s} for s in projs]}
desc="Every product Joshua Almeida built with Grok: source, docs, and live demos for Locker, Garage, Stampback, Armchair Atlas, Scanrepo, EchoApp, Dilop, Hailset and the Notebook."
open(os.path.join(OUT,'index.html'),'w').write(f'<!doctype html><html lang="en"><head>{head("Grok Builds · All projects by Joshua Almeida",desc,BASE,ld)}<style>{CSS}</style></head><body><header><h1>Grok Builds</h1><p>{e(desc)} Source: <a href="{GH}{R}">{GH}{R}</a></p></header><main>{cards}<h2 id="notebook">Notebook entries</h2><ol>{nbl}</ol></main></body></html>')
pages.insert(0,BASE)
open(os.path.join(OUT,'sitemap.xml'),'w').write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+''.join(f'<url><loc>{u}</loc><lastmod>{today}</lastmod></url>\n' for u in pages)+'</urlset>\n')
open(os.path.join(OUT,'robots.txt'),'w').write(f'User-agent: *\nAllow: /\nSitemap: {BASE}sitemap.xml\n')
open(os.path.join(OUT,'.nojekyll'),'w').write('')
# README
rd=f'# Grok Builds\n\n{desc}\n\n**Site:** {BASE} · **Sitemap:** {BASE}sitemap.xml\n\n| Project | Description | Source | Page | Original repo | Live demo |\n|---|---|---|---|---|---|\n'
rd+=''.join(f'| {meta[s][0]} | {meta[s][1].replace("|","/")} | [projects/{s}](projects/{s}) | [page]({BASE}{s}/) | [{s}]({GH}{s}) | '+('—' if s in NOPAGES else f'[demo](https://fitzyracing1.github.io/{s}/)')+' |\n' for s in projs)
rd+='\n## Notebook entries\n\n'+''.join(f'- [{t}]({BASE}notebook/site/{f}): {d}\n' for f,t,d in nb)
rd+='\n## How it works\n\n`build_site.py` renders each project README (pandoc) and copies the Notebook\'s pre-rendered KaTeX pages into `site/`, which `.github/workflows/pages.yml` deploys to GitHub Pages. MIT licensed.\n'
open(os.path.join(ROOT,'README.md'),'w').write(rd)
print(len(pages),'pages')
