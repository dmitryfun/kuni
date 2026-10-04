"""Exercise the actual deployment shell with fake infrastructure, never a VPS."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
ORIGINAL = 'https://other.example {\n    reverse_proxy existing:3000\n}\n'

FAKE = r'''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
args = sys.argv[1:]
tool = Path(sys.argv[0]).name
root = Path(os.environ['FAKE_ROOT'])
scenario = os.environ['FAKE_SCENARIO']
with (root / 'calls.jsonl').open('a') as log:
    log.write(json.dumps([tool, *args]) + '\n')
if tool == 'git':
    if args[:1] == ['rev-parse']: print('0123456789ab')
elif tool == 'curl':
    url = args[-1]
    if scenario == 'tls': sys.exit(1)
    if url.endswith('/healthz'): print('{"status":"ok"}')
    elif url.endswith('.glb'): sys.stdout.buffer.write((root / 'public/rig/kuniman.glb').read_bytes())
    else: print('<h1>kuniman</h1>')
elif tool == 'docker':
    if args == ['ps', '-q']: print('caddy-id')
    elif args[:1] == ['inspect'] and '--format' not in args:
        print(json.dumps([{'Id':'caddy-id','Name':'/caddy','State':{'Running':True},'Mounts':[{'Type':'bind','Source':str(root/'Caddyfile'),'Destination':'/etc/caddy/Caddyfile'}],'NetworkSettings':{'Networks':{'remnawave-network':{}}}}]))
    elif args[:2] == ['container', 'inspect']: sys.exit(0 if os.environ['FAKE_PREVIOUS'] == '1' else 1)
    elif '--format' in args:
        print('kuniman' if 'Labels' in args[args.index('--format')+1] else 'kuniman:previous')
    elif args[:1] == ['exec'] and 'wget' in args:
        if scenario == 'network': sys.exit(1)
        print('{"status":"ok"}')
    elif args[:1] == ['exec'] and 'validate' in args:
        if scenario == 'validate' and 'BEGIN kuniman.me' in (root/'Caddyfile').read_text(): sys.exit(1)
    elif args[:1] == ['exec'] and 'reload' in args:
        if scenario == 'reload' and 'BEGIN kuniman.me' in (root/'Caddyfile').read_text(): sys.exit(1)
    elif args[:1] == ['compose'] and 'up' in args and scenario == 'start' and '--env-file' not in args:
        sys.exit(1)
'''


class DeploymentRecovery(unittest.TestCase):
    def run_deployment(self, scenario, previous=False):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        shutil.copytree(ROOT / 'deploy', root / 'deploy', ignore=shutil.ignore_patterns('__pycache__'))
        shutil.copyfile(ROOT / 'compose.yaml', root / 'compose.yaml')
        (root / 'public/rig').mkdir(parents=True)
        (root / 'public/rig/kuniman.glb').write_bytes(b'glTF-test-fixture')
        caddy = root / 'Caddyfile'
        caddy.write_text(ORIGINAL)
        inode = caddy.stat().st_ino
        binary = root / 'bin'
        binary.mkdir()
        for name in ('docker', 'git', 'curl', 'flock'):
            executable = binary / name
            executable.write_text(FAKE)
            executable.chmod(0o755)
        if previous:
            (root / '.deploy').mkdir()
            (root / '.deploy/current.env').write_text('KUNI_IMAGE=kuniman:previous\nKUNI_NETWORK=remnawave-network\n')
            shutil.copyfile(root / 'compose.yaml', root / '.deploy/current-compose.yaml')
        environment = {**os.environ, 'PATH': str(binary) + os.pathsep + os.environ['PATH'], 'FAKE_ROOT': str(root), 'FAKE_SCENARIO': scenario, 'FAKE_PREVIOUS': '1' if previous else '0', 'KUNI_CADDY_FILE': str(caddy)}
        environment.pop('KUNI_NETWORK', None)
        result = subprocess.run(['bash', 'deploy/deploy.sh'], cwd=root, env=environment, capture_output=True, text=True)
        calls = [json.loads(line) for line in (root / 'calls.jsonl').read_text().splitlines()]
        self.assertEqual(caddy.stat().st_ino, inode, 'Individual bind mount inode must remain unchanged')
        return root, result, calls

    def test_failed_start_or_network_check_removes_only_new_site(self):
        for scenario in ('start', 'network'):
            with self.subTest(scenario=scenario):
                root, result, calls = self.run_deployment(scenario)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual((root / 'Caddyfile').read_text(), ORIGINAL)
                self.assertTrue(any(call[:2] == ['docker', 'compose'] and 'rm' in call and call[-1] == 'web' for call in calls))
                self.assertFalse(any('reload' in call for call in calls))

    def test_validation_reload_or_tls_failure_restores_caddy(self):
        for scenario in ('validate', 'reload', 'tls'):
            with self.subTest(scenario=scenario):
                root, result, calls = self.run_deployment(scenario)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual((root / 'Caddyfile').read_text(), ORIGINAL)
                self.assertTrue(any('reload' in call for call in calls))
                self.assertFalse((root / '.deploy/current.env').exists())

    def test_existing_release_is_restored_after_failure(self):
        root, result, calls = self.run_deployment('tls', previous=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('KUNI_IMAGE=kuniman:previous', (root / '.deploy/current.env').read_text())
        self.assertTrue(any(call[:2] == ['docker', 'compose'] and '--env-file' in call and 'up' in call for call in calls))
        self.assertFalse(any('rm' in call for call in calls))

    def test_success_persists_release_and_preserves_other_sites(self):
        root, result, calls = self.run_deployment('success')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((root / 'Caddyfile').read_text().startswith(ORIGINAL))
        self.assertIn('KUNI_IMAGE=kuniman:0123456789ab', (root / '.deploy/current.env').read_text())
        self.assertTrue(any('reload' in call for call in calls))


if __name__ == '__main__':
    unittest.main()
