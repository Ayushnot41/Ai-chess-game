"""Vendor the exact browser libraries already used by this app for offline demos."""
from pathlib import Path
import hashlib
import json
import urllib.request

root = Path(__file__).resolve().parent.parent
target = root / 'frontend/vendor'
target.mkdir(exist_ok=True)
sources = {
    'three.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
    'OrbitControls.js': 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
    'chess.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js',
    'three-LICENSE.txt': 'https://cdn.jsdelivr.net/npm/three@0.128.0/LICENSE',
    'chess-LICENSE.txt': 'https://cdn.jsdelivr.net/npm/chess.js@0.10.3/LICENSE',
}
manifest = []
for name, url in sources.items():
    request = urllib.request.Request(url, headers={'User-Agent': 'Grandmaster-AI dependency vendoring'})
    with urllib.request.urlopen(request, timeout=30) as response:
        content = response.read()
    if not content or b'<html' in content[:200].lower():
        raise ValueError(f'Unexpected response for {name}')
    (target / name).write_bytes(content)
    manifest.append({'file':name,'source':url,'sha256':hashlib.sha256(content).hexdigest()})
    print(f'{name}: {len(content)} bytes')
(target / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
path = root / 'frontend/index.html'
html = path.read_text(encoding='utf-8')
for name, url in sources.items():
    if name.endswith('.js'):
        html = html.replace(url, f'vendor/{name}')
path.write_text(html, encoding='utf-8')
