import os
import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import server


class CompilerTests(unittest.TestCase):
    def test_compiles_the_original_source(self):
        self.assertEqual(server.SOURCE, server.ROOT / 'FinalVersion.cpp')

    def test_old_adapter_binary_is_rebuilt_even_when_newer_than_original_source(self):
        with tempfile.TemporaryDirectory(dir=server.ROOT) as folder:
            binary=Path(folder)/'connect6-ai'
            binary.write_bytes(b'old adapter binary')
            calls=[]
            def compile_fake(command, **kwargs):
                calls.append(command)
                Path(command[command.index('-o')+1]).write_bytes(b'compiled original')
                return server.subprocess.CompletedProcess(command,0,'','')
            with patch.object(server,'BINARY',binary), patch('server.find_compiler',return_value='g++'), patch('server.subprocess.run',side_effect=compile_fake):
                server.build_ai()
                self.assertEqual(len(calls),1)
                self.assertIn(str(server.ROOT/'FinalVersion.cpp'),calls[0])
                server.build_ai()
                self.assertEqual(len(calls),1,'unchanged source should use the new cached binary')
            self.assertEqual(binary.read_bytes(),b'compiled original')
            self.assertEqual(binary.with_name(binary.name+'.source.sha256').read_text().strip(),hashlib.sha256(server.SOURCE.read_bytes()).hexdigest())

    def test_explicit_compiler_wins(self):
        with patch.dict(os.environ, {'CXX': '/custom path/clang++'}):
            self.assertEqual(server.find_compiler(), '/custom path/clang++')

    def test_clang_fallback_without_gcc(self):
        with patch.dict(os.environ, {'CXX': ''}), patch('server.shutil.which', side_effect=lambda name: '/usr/bin/clang++' if name == 'clang++' else None):
            self.assertEqual(server.find_compiler(), '/usr/bin/clang++')

    def test_generic_cxx_fallback(self):
        with patch.dict(os.environ, {'CXX': ''}), patch('server.shutil.which', side_effect=lambda name: '/usr/bin/c++' if name == 'c++' else None):
            self.assertEqual(server.find_compiler(), '/usr/bin/c++')

    def test_posix_build_uses_portable_flags(self):
        with tempfile.TemporaryDirectory(dir=server.ROOT) as folder:
            binary=Path(folder)/'nested'/'connect6-ai'
            commands=[]
            def compile_fake(command, **kwargs):
                commands.append(command)
                Path(command[command.index('-o')+1]).write_bytes(b'fake executable')
                return server.subprocess.CompletedProcess(command,0,'','')
            with patch.object(server,'BINARY',binary), patch('server.sys.platform','darwin'), patch('server.find_compiler',return_value='/usr/bin/clang++'), patch('server.subprocess.run',side_effect=compile_fake):
                self.assertEqual(server.build_ai(),binary)
            self.assertTrue(binary.exists())
            self.assertIn('-std=c++17',commands[0])
            self.assertNotIn('-static',commands[0])
            self.assertFalse(any(flag.startswith('-fexec-charset') for flag in commands[0]))


if __name__ == '__main__': unittest.main()
