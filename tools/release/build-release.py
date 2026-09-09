#!/usr/bin/env python3

import argparse
import datetime
import hashlib
import json
import os
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ROOT_FILES = [
    'index.html', 'version.json', 'agent-manifest.json', 'README.md',
    'THIRD_PARTY_NOTICES.md', 'LICENSE', 'LICENSE-STATUS.md', 'test-fixture.pdf', 'test-multi.pdf',
]
DIRECTORIES = ['src', 'vendor', 'public', 'licenses', 'schemas', 'integrations/agents', 'tools/ai', 'tools/tests', 'tests']
DOC_FILES = [
    'docs/USER_GUIDE.md',
    'docs/AGENT_API.md',
    'docs/PRODUCT_BOUNDARIES.md',
    'docs/COMPATIBILITY_AND_RELEASE.md',
    'docs/AUDIT_AI_NATIVE_2026-08-09.md',
]


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def git_value(*args, fallback='unknown'):
    try:
        return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()
    except Exception:
        return fallback


def collect_files():
    files = [ROOT / item for item in ROOT_FILES + DOC_FILES]
    for directory in DIRECTORIES:
        files.extend(path for path in (ROOT / directory).rglob('*') if path.is_file())
    return sorted(set(files), key=lambda item: item.relative_to(ROOT).as_posix())


def build_sbom(version, components):
    return {
        'bomFormat': 'CycloneDX', 'specVersion': '1.6',
        'serialNumber': f'urn:uuid:yinji-{version}', 'version': 1,
        'metadata': {'component': {'type': 'application', 'name': 'Yinji', 'version': version}},
        'components': [
            {
                'type': 'library', 'name': item['name'], 'version': item['version'],
                'licenses': [{'license': {'id': item['license']}}],
                'properties': [{'name': 'yinji:path', 'value': item['path']}],
            }
            for item in components
        ],
    }


def main():
    parser = argparse.ArgumentParser(description='Build a deterministic Yinji release candidate archive.')
    parser.add_argument('--output-dir', default=str(ROOT / 'dist'))
    args = parser.parse_args()
    version_info = json.loads((ROOT / 'version.json').read_text())
    version = version_info['version']
    if '-' not in version and not (ROOT / 'LICENSE').exists():
        raise SystemExit('Stable/public release blocked: owner-approved LICENSE is missing.')

    files = collect_files()
    missing = [str(path.relative_to(ROOT)) for path in files if not path.exists()]
    if missing:
        raise SystemExit(f'Missing release files: {missing}')
    commit = git_value('rev-parse', 'HEAD')
    epoch = int(os.environ.get('SOURCE_DATE_EPOCH') or git_value('show', '-s', '--format=%ct', fallback='0') or '0')
    timestamp = tuple(datetime.datetime.fromtimestamp(max(epoch, 315532800), datetime.timezone.utc).timetuple()[:6])
    manifest = {
        'schema': 'yinji-release-manifest/v1', 'version': version,
        'channel': version_info.get('channel'), 'commit': commit,
        'sourceDateEpoch': epoch, 'files': [],
    }
    entries = []
    for file_path in files:
        data = file_path.read_bytes()
        name = file_path.relative_to(ROOT).as_posix()
        entries.append((name, data))
        manifest['files'].append({'path': name, 'size': len(data), 'sha256': sha256(data)})

    components = json.loads((ROOT / 'release/components.json').read_text())
    entries.extend({
        'release-manifest.json': json.dumps(manifest, ensure_ascii=False, indent=2).encode(),
        'sbom.cdx.json': json.dumps(build_sbom(version, components), ensure_ascii=False, indent=2).encode(),
    }.items())
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    archive = output_dir / f'yinji-{version}.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
        for name, data in sorted(entries):
            info = zipfile.ZipInfo(name, timestamp)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            bundle.writestr(info, data)
    digest = sha256(archive.read_bytes())
    (output_dir / 'SHA256SUMS').write_text(f'{digest}  {archive.name}\n')
    print(json.dumps({'ok': True, 'version': version, 'archive': str(archive), 'sha256': digest, 'files': len(entries)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
