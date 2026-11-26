#!/usr/bin/env python3
"""Publie une version de la PWA : python3 tools/release.py "Nouveautés en une phrase"
 - incrémente le numéro (app/version.json « n »), met à jour VERSION dans app/sw.js
 - régénère app/version.json : version affichée, nouveautés, liste des fichiers pré-téléchargés par le service worker
Ensuite : git add -A && git commit && git push"""
import json, os, re, sys, datetime
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app')
vj = os.path.join(root, 'version.json')
prev = json.load(open(vj)) if os.path.exists(vj) else {'n': 85}
n = prev['n'] + 1
notes = sys.argv[1] if len(sys.argv) > 1 else prev.get('notes', '')
skip_dirs = ('voix',)
files = []
for d, ds, fs in os.walk(root):
    rel = os.path.relpath(d, root)
    if rel.split(os.sep)[0] in skip_dirs: continue
    for f in fs:
        p = os.path.normpath(os.path.join(rel, f)).replace(os.sep, '/')
        if p in ('sw.js', 'version.json') or p.endswith('.map') or p.startswith('.'): continue
        files.append(p)
files.sort()
files = ['./'] + files
json.dump({'v': '23.%d' % n, 'n': n, 'notes': notes, 'files': files}, open(vj, 'w'), ensure_ascii=False, indent=0)
sw = os.path.join(root, 'sw.js'); s = open(sw).read()
ver = "ridenct-%s.%d" % (datetime.date.today().isoformat(), n)
s2 = re.sub(r"const VERSION = '[^']*';", "const VERSION = '%s';" % ver, s, count=1)
assert s2 != s or ver in s
open(sw, 'w').write(s2)
print('v23.%d  (%s)  %d fichiers' % (n, ver, len(files)))
