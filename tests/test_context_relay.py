import importlib.util
import json
import os
from pathlib import Path
import tempfile
import io
import runpy
import sys
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('context_relay', Path(__file__).parents[1] / 'scripts/context-relay.py')
relay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(relay)


class ContextRelayTests(unittest.TestCase):
    def test_claude_statusline_captures_native_percent_and_nothing_else(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            (home / '.claude').mkdir()
            data = {'session_id': 'session-one', 'context_window': {
                'used_percentage': 42, 'context_window_size': 200000,
                'current_usage': {'input_tokens': 4000, 'cache_read_input_tokens': 80000}},
                'rate_limits': {'five_hour': {'used_percentage': 12}}}
            with patch.object(Path, 'home', return_value=home), patch.dict(os.environ, {'HC_TERMINAL_ID': 't3'}), \
                 patch.object(sys, 'stdin', io.StringIO(json.dumps(data))), patch.object(sys, 'argv', ['relay', 'claude']):
                runpy.run_path(str(Path(__file__).parents[1] / 'scripts/context-relay.py'), run_name='__main__')
            snapshot = json.loads((home / '.config/harness/context/t3.claude.json').read_text())
            self.assertEqual(snapshot['percent'], 42)
            self.assertNotIn('tokens', snapshot)
            self.assertFalse((home / '.claude/herdr-usage.json').exists())

    def test_a_reused_address_keeps_its_newest_snapshot(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(relay, 'ROOT', Path(directory)):
            (Path(directory) / 't12.claude.json').write_text(json.dumps({'address': 't12', 'tool': 'claude', 'percent': 19, 'updatedAt': 200}))
            (Path(directory) / 't12.pi.json').write_text(json.dumps({'address': 't12', 'tool': 'pi', 'percent': 70, 'updatedAt': 100}))
            self.assertEqual(relay.collect()['t12']['tool'], 'claude')

    def test_unknown_context_is_not_zero(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(relay, 'ROOT', Path(directory)):
            (Path(directory) / 't1.pi.json').write_text(json.dumps({'address': 't1', 'percent': None}))
            self.assertEqual(relay.collect(), {})

    def test_terminals_in_same_folder_keep_distinct_snapshots(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(relay, 'ROOT', Path(directory)):
            for address, percent in [('t1', 0), ('t2', 72)]:
                with patch.dict(os.environ, {'HC_TERMINAL_ID': address}):
                    relay.save('pi', {'sessionId': address, 'percent': percent})
            result = relay.collect()
            self.assertEqual(result['t1']['percent'], 0)
            self.assertEqual(result['t2']['percent'], 72)


if __name__ == '__main__':
    unittest.main()
