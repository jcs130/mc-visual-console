import unittest, importlib.util
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'export-minecraft-viewer-content.py'
spec=importlib.util.spec_from_file_location('content',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Palette26Tests(unittest.TestCase):
 def test_official_unobfuscated_bytecode(self):
  code=(Path(__file__).parent/'fixtures/MapColor-26.1.javap.txt').read_text()
  colors=m.parse_palette_code(code)
  self.assertEqual(len(colors),62);self.assertEqual(colors[:3],[0,8368696,16247203])
 def test_corrupt_constructor_fails_closed(self):
  code=(Path(__file__).parent/'fixtures/MapColor-26.1.javap.txt').read_text().replace('int 8368696','int 8368696 extra\n 99: iconst_2',1)
  with self.assertRaises(ValueError):m.parse_palette_code(code)
if __name__=='__main__':unittest.main()
