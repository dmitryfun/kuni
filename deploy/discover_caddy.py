"""Discover the running container mounting the actual host Caddyfile."""
import json
import os
import subprocess
import sys
from pathlib import Path, PurePosixPath


def discover(containers, config_file, preferred_container='', preferred_network=''):
    config = Path(config_file).resolve()
    candidates = []
    for container in containers:
        if not container['State']['Running']:
            continue
        if preferred_container and preferred_container not in (container['Id'], container['Name'].lstrip('/')):
            continue
        for mount in container.get('Mounts', []):
            if mount['Type'] != 'bind':
                continue
            source = Path(mount['Source']).resolve()
            if source == config:
                destination = mount['Destination']
            elif source in config.parents:
                destination = str(PurePosixPath(mount['Destination']) / config.relative_to(source).as_posix())
            else:
                continue
            networks = sorted(n for n in container['NetworkSettings']['Networks'] if n not in ('bridge', 'host', 'none'))
            if preferred_network:
                if preferred_network not in networks:
                    raise ValueError('KUNI_NETWORK is not connected to Caddy')
                networks = [preferred_network]
            if len(networks) != 1:
                raise ValueError('Set KUNI_NETWORK to one of these Caddy networks: ' + ', '.join(networks))
            candidates.append((container['Id'], destination, networks[0]))
    if len(candidates) != 1:
        raise ValueError('Expected exactly one running container mounting Caddyfile; set KUNI_CADDY_CONTAINER if needed')
    return candidates[0]


if __name__ == '__main__':
    ids = subprocess.check_output(['docker', 'ps', '-q'], text=True).split()
    if not ids:
        sys.exit('No running Docker containers')
    containers = json.loads(subprocess.check_output(['docker', 'inspect', *ids], text=True))
    try:
        result = discover(containers, sys.argv[1], os.environ.get('KUNI_CADDY_CONTAINER', ''), os.environ.get('KUNI_NETWORK', ''))
        print('\t'.join(result))
    except ValueError as error:
        sys.exit(str(error))
