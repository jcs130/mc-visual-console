import unittest
from connections import classify_sockets, address


class ConnectionTest(unittest.TestCase):
    def test_gateway_connections_use_process_ownership_and_do_not_count_game_or_console_sockets(self):
        processes = [{"id": 10, "parent": 1, "group": "MC"}, {"id": 11, "parent": 10, "group": None},
                     {"id": 20, "parent": 1, "group": "NEKO"}]
        rows = """TCP 127.0.0.1:51001 192.0.2.1:4000 ESTABLISHED 10
TCP 127.0.0.1:51002 192.0.2.1:4000 ESTABLISHED 11
TCP 127.0.0.1:51003 192.0.2.1:4000 ESTABLISHED 20
TCP 127.0.0.1:51004 192.0.2.1:4000 ESTABLISHED 99
TCP 127.0.0.1:51001 192.0.2.1:4000 ESTABLISHED 10
TCP 127.0.0.1:51005 192.0.2.1:25565 ESTABLISHED 11
TCP 127.0.0.1:7789 127.0.0.1:51006 ESTABLISHED 10
TCP 127.0.0.1:51007 192.0.2.1:4000 TIME_WAIT 20"""
        self.assertEqual(classify_sockets(rows, processes, {address("192.0.2.1:4000")}), {"NEKO": 1, "MC": 2, "unclassified": 1})

    def test_ipv6_and_cyclic_process_parents(self):
        self.assertEqual(address("[::ffff:192.0.2.1]:4000"), ("192.0.2.1", 4000))
        self.assertEqual(classify_sockets("TCP [::1]:123 [::1]:4000 ESTABLISHED 1",
            [{"id": 1, "parent": 2}, {"id": 2, "parent": 1}], {address("[::1]:4000")})["unclassified"], 1)
