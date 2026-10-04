import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from caddy_config import prepare, BLOCK, BEGIN, END
from discover_caddy import discover

ORIGINAL = '''https://dmitry.dpdns.org {
    reverse_proxy remnawave:3000
}
:443 {
    tls internal
    respond 204
}
https://outlook.dmitry.dpdns.org {
    reverse_proxy outlook-control-panel:80
}
'''


class CaddyPreservation(unittest.TestCase):
    def test_existing_sites_remain_byte_for_byte(self):
        result = prepare(ORIGINAL)
        self.assertTrue(result.startswith(ORIGINAL))
        self.assertIn('reverse_proxy kuniman-web:3000', result)

    def test_second_deployment_is_idempotent(self):
        once = prepare(ORIGINAL)
        self.assertEqual(prepare(once), once)

    def test_refuses_existing_domain_and_broken_markers(self):
        for source in (ORIGINAL + 'kuniman.me {\n respond 200\n}\n', BEGIN, END + '\n' + BEGIN, BLOCK + BLOCK):
            with self.subTest(source=source), self.assertRaises(ValueError):
                prepare(source)

    def test_managed_replacement_preserves_following_site(self):
        following = '\nhttps://bin.dmitry.dpdns.org {\n reverse_proxy tools:3010\n}\n'
        source = ORIGINAL + BLOCK.replace('kuniman-web:3000', 'old:3000') + following
        self.assertEqual(prepare(source), ORIGINAL + BLOCK + following)


def container(source, destination, networks=('remnawave-network',)):
    return {'Id': 'caddy-id', 'Name': '/caddy', 'State': {'Running': True}, 'Mounts': [{'Type': 'bind', 'Source': source, 'Destination': destination}], 'NetworkSettings': {'Networks': dict.fromkeys(networks, {})}}


class CaddyDiscovery(unittest.TestCase):
    def test_individual_file_mount(self):
        self.assertEqual(discover([container('/opt/remnawave/caddy/Caddyfile', '/etc/caddy/Caddyfile')], '/opt/remnawave/caddy/Caddyfile'), ('caddy-id', '/etc/caddy/Caddyfile', 'remnawave-network'))

    def test_directory_mount(self):
        self.assertEqual(discover([container('/opt/remnawave/caddy', '/etc/caddy')], '/opt/remnawave/caddy/Caddyfile')[1], '/etc/caddy/Caddyfile')

    def test_ambiguous_network_or_missing_mount_fails(self):
        multi = container('/opt/remnawave/caddy', '/etc/caddy', ('one', 'two'))
        with self.assertRaises(ValueError):
            discover([multi], '/opt/remnawave/caddy/Caddyfile')
        self.assertEqual(discover([multi], '/opt/remnawave/caddy/Caddyfile', preferred_network='two')[2], 'two')
        with self.assertRaises(ValueError):
            discover([multi], '/other/Caddyfile')


if __name__ == '__main__':
    unittest.main()
