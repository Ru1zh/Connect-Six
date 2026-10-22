import hashlib
import json
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

import server

ROOT = Path(__file__).resolve().parents[1]
ORIGINAL_HASH = '305a4b9b18cbb9a4b9972829d588f7b05c5e2a80b900db95166f0624ec22b24d'


class RulesTests(unittest.TestCase):
    def test_original_untouched(self):
        self.assertEqual(hashlib.sha256((ROOT/'FinalVersion.cpp').read_bytes()).hexdigest(), ORIGINAL_HASH)

    def test_botzone_protocol_both_colors(self):
        opening = [{'color':1,'stones':[[7,7]]}]
        pair = {'color':-1,'stones':[[6,7],[7,6]]}
        self.assertEqual(server.to_protocol([],1), '1\n-1 -1 -1 -1\n')
        self.assertEqual(server.to_protocol(opening,-1), '1\n7 7 -1 -1\n')
        self.assertEqual(server.to_protocol(opening+[pair],1), '2\n-1 -1 -1 -1\n7 7 -1 -1\n6 7 7 6\n')

    def test_reject_bad_history(self):
        for history, color in [
            ([{'color':-1,'stones':[[0,0]]}],1),
            ([{'color':1,'stones':[[15,0]]}],-1),
            ([{'color':1,'stones':[[True,0]]}],-1),
            ([{'color':1,'stones':[[0,0],[1,0]]}],-1),
            ([{'color':1,'stones':[[0,0]]},{'color':-1,'stones':[[1,1],[1,1]]}],1),
            ([], -1),
        ]:
            with self.subTest(history=history), self.assertRaises(ValueError):
                server.validate_history(history,color)

    def test_reject_finished_game(self):
        history=[{'color':1,'stones':[[0,0]]}]
        for black,white in [([[1,0],[2,0]],[[0,14],[2,14]]),([[3,0],[4,0]],[[4,14],[6,14]])]:
            history += [{'color':-1,'stones':white},{'color':1,'stones':black}]
        history += [{'color':-1,'stones':[[8,14],[10,14]]},{'color':1,'stones':[[5,0]]}]
        with self.assertRaises(ValueError): server.validate_history(history,-1)


class AITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.binary = server.build_ai()

    def test_opening_center_and_legal_corner(self):
        self.assertEqual(server.request_ai([],1), [[7,7]])
        for x,y in [(7,7),(14,14)]:
            history=[{'color':1,'stones':[[x,y]]}]
            stones=server.request_ai(history,-1)
            self.assertEqual(len(stones),2)
            self.assertEqual(len(set(map(tuple,stones))),2)
            self.assertNotIn([x,y],stones)
            self.assertTrue(all(0 <= a < 15 for p in stones for a in p))

    def test_original_invalid_corner_moves_are_reported_without_substitution(self):
        for x,y in [(0,0),(0,14),(14,0)]:
            with self.subTest(point=[x,y]), self.assertRaisesRegex(RuntimeError,'非法落点'):
                server.request_ai([{'color':1,'stones':[[x,y]]}],-1)

    def test_regular_turn(self):
        history=[{'color':1,'stones':[[7,7]]},{'color':-1,'stones':[[6,7],[7,6]]}]
        stones=server.request_ai(history,1)
        server.validate_history(history+[{'color':1,'stones':stones}],-1)

    def test_timeout_and_invalid_output(self):
        with patch('server.subprocess.run',side_effect=subprocess.TimeoutExpired('ai',30)):
            with self.assertRaisesRegex(RuntimeError,'超时'): server.request_ai([],1)
        for output in ['nonsense','0 0 0 0','15 0 -1 -1']:
            fake=subprocess.CompletedProcess([],0,output,'')
            with patch('server.subprocess.run',return_value=fake):
                with self.assertRaises(RuntimeError): server.request_ai([],1)


if __name__ == '__main__': unittest.main()
