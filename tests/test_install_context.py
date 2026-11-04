import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

INSTALL = Path(__file__).parents[1] / 'scripts/install-context.py'


def install(home):
    env = dict(os.environ, HOME=str(home), USERPROFILE=str(home))
    return subprocess.run([sys.executable, str(INSTALL)], env=env, capture_output=True, text=True, check=True)


class InstallContextTests(unittest.TestCase):
    def test_claude_without_settings_file_gets_the_status_line(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            (home / '.claude').mkdir()
            install(home)
            settings = json.loads((home / '.claude/settings.json').read_text())
            self.assertIn('context-relay.py', settings['statusLine']['command'])
            self.assertEqual(settings['statusLine']['type'], 'command')

    def test_existing_status_line_is_kept_and_other_settings_untouched(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            (home / '.claude').mkdir()
            mine = {'type': 'command', 'command': 'my-status-line'}
            (home / '.claude/settings.json').write_text(json.dumps({
                'statusLine': mine, 'attribution': {'commit': '', 'pr': ''}, 'theme': 'dark'}))
            install(home)
            install(home)
            settings = json.loads((home / '.claude/settings.json').read_text())
            self.assertIn('context-relay.py', settings['statusLine']['command'])
            self.assertEqual(settings['attribution'], {'commit': '', 'pr': ''})
            self.assertEqual(settings['theme'], 'dark')
            original = json.loads((home / '.config/harness/claude-statusline-original.json').read_text())
            self.assertEqual(original, mine)
            self.assertTrue((home / '.claude/settings.json.before-harness-context').exists())

    def test_no_claude_code_no_settings_written(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            install(home)
            self.assertFalse((home / '.claude').exists())
            self.assertTrue((home / '.config/harness/context-relay.py').exists())


if __name__ == '__main__':
    unittest.main()
