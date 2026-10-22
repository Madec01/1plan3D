#!/usr/bin/env python3
"""Optional asset maintenance, not part of install/build. Requires Pillow.

Fetch pinned CC0 maps over verified HTTPS, check their SHA-256, then resize and
encode the embedded pack. No remote fetch is made by the application itself.
Usage: python3 scripts/prepare-textures.py [--cache /path/to/cache]
"""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import urllib.request

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=Path('/tmp/atelier-texture-cache'))
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    sources = json.loads((ROOT / 'assets/textures/sources.json').read_text())
    pack = {}
    for key, source in sources.items():
        pack[key] = {}
        for kind, entry in source['maps'].items():
            cached = args.cache / entry['sha256']
            data = cached.read_bytes() if cached.exists() else urllib.request.urlopen(entry['url'], timeout=60).read()
            if hashlib.sha256(data).hexdigest() != entry['sha256']:
                raise ValueError(f'Integrity check failed: {key}/{kind}')
            cached.write_bytes(data)
            with Image.open(io.BytesIO(data)) as original:
                image = original.convert('RGB')
                if 'crop' in source:
                    image = image.crop(source['crop'])
                if kind == 'color':
                    pack[key]['averageColor'] = '#%02x%02x%02x' % image.resize((1,1), Image.Resampling.BOX).getpixel((0,0))
                # Preserve the rectangular crop's aspect ratio. JPEG maps stay
                # in their original color spaces; normal maps are OpenGL.
                image.thumbnail((512,512) if kind == 'color' else (256,256), Image.Resampling.LANCZOS)
                encoded = io.BytesIO()
                image.save(encoded, 'JPEG', quality=88 if kind == 'normal' else 82, subsampling=0, optimize=True)
                pack[key][kind] = 'data:image/jpeg;base64,' + base64.b64encode(encoded.getvalue()).decode('ascii')
        print(f'{key}: color + normal + roughness verified')
    output = ROOT / 'assets/textures/pack.json'
    output.write_text(json.dumps(pack, separators=(',', ':')) + '\n')
    print(f'Embedded pack: {output.stat().st_size // 1024} KiB')


if __name__ == '__main__':
    main()
