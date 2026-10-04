"""Change only this site's marked Caddy block; refuse conflicting ownership."""
import re
import sys
from pathlib import Path

BEGIN = '# BEGIN kuniman.me (managed by kuni)'
END = '# END kuniman.me (managed by kuni)'
BLOCK = f'''{BEGIN}
https://kuniman.me {{
    encode zstd gzip
    reverse_proxy kuniman-web:3000
}}
{END}
'''


def prepare(source):
    starts, ends = source.count(BEGIN), source.count(END)
    if starts != ends or starts > 1:
        raise ValueError('Malformed or duplicate managed Caddy block')
    if starts:
        first, last = source.index(BEGIN), source.index(END) + len(END)
        if last < first:
            raise ValueError('Reversed Caddy block markers')
        if source[last:last + 1] == '\n':
            last += 1
        outside = source[:first] + source[last:]
    else:
        outside = source
    # Never take over a domain configured elsewhere in this file.
    uncommented = '\n'.join(line.split('#', 1)[0] for line in outside.splitlines())
    if re.search(r'(?<![\w.-])kuniman\.me(?![\w.-])', uncommented):
        raise ValueError('kuniman.me already has an unmanaged Caddy configuration')
    if starts:
        return source[:first] + BLOCK + source[last:]
    return source + ('\n' if source.endswith('\n') else '\n\n') + BLOCK


if __name__ == '__main__':
    try:
        Path(sys.argv[2]).write_text(prepare(Path(sys.argv[1]).read_text()))
    except ValueError as error:
        sys.exit(str(error))
