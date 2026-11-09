import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('install', Path(__file__).parents[1] / 'scripts/install.py')
install = importlib.util.module_from_spec(spec)
spec.loader.exec_module(install)


def chat_repo(folder):
    """A git repository shaped like herdr-chat, with one file in its mod."""
    mod = folder / 'mods' / 'herdr-chat'
    mod.mkdir(parents=True)
    (mod / 'main.js').write_text('export default class Chat {}\n')
    git = ['git', '-c', 'user.name=test', '-c', 'user.email=test@example.com', '-C', str(folder)]
    subprocess.run(git + ['init', '--quiet'], check=True)
    subprocess.run(git + ['add', '.'], check=True)
    subprocess.run(git + ['commit', '--quiet', '-m', 'chat'], check=True)
    return str(folder)


class InstallChatTests(unittest.TestCase):
    def test_a_missing_chat_mod_is_installed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            home = root / 'home'
            (home / 'mods').mkdir(parents=True)
            self.assertEqual(install.install_chat(home, chat_repo(root / 'chat')), 'installed')
            self.assertTrue((home / 'mods/herdr-chat/main.js').is_file())
            self.assertFalse((home / 'mods/.herdr-chat.new').exists())

    def test_an_installed_chat_mod_is_kept(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            home = root / 'home'
            (home / 'mods/herdr-chat').mkdir(parents=True)
            (home / 'mods/herdr-chat/main.js').write_text('mine\n')
            self.assertEqual(install.install_chat(home, chat_repo(root / 'chat')), 'kept')
            self.assertEqual((home / 'mods/herdr-chat/main.js').read_text(), 'mine\n')

    def test_a_source_that_cannot_be_reached_installs_nothing(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory) / 'home'
            (home / 'mods').mkdir(parents=True)
            with self.assertRaises(Exception):
                install.install_chat(home, str(Path(directory) / 'missing'))
            self.assertFalse((home / 'mods/herdr-chat').exists())


class BackupTests(unittest.TestCase):
    def test_the_same_layout_with_other_line_endings_is_not_backed_up(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'installed.json').write_bytes(b'{\r\n  "id": "root"\r\n}\r\n')
            (root / 'new.json').write_bytes(b'{\n  "id": "root"\n}\n')
            self.assertFalse(install.back_up_if_changed(root / 'installed.json', root / 'new.json', root / 'backup.json'))
            self.assertFalse((root / 'backup.json').exists())

    def test_a_changed_layout_is_backed_up(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'installed.json').write_text('{"id": "mine"}\n')
            (root / 'new.json').write_text('{"id": "root"}\n')
            self.assertTrue(install.back_up_if_changed(root / 'installed.json', root / 'new.json', root / 'backup.json'))
            self.assertEqual((root / 'backup.json').read_text(), '{"id": "mine"}\n')


if __name__ == '__main__':
    unittest.main()
