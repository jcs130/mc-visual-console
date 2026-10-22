from pathlib import Path
from types import SimpleNamespace
import copy,sys,unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from native_viewer_assets import BASE_PRIORITY_SOURCES,BASE_PRIORITY_PLATFORMS,BASE_PRIORITY_TEXTURES,resolve_audited_base_priority

class PriorityExportTest(unittest.TestCase):
    def fixture(self,client='1.21.1.jar',platform='neoforge-21.1.250-universal.jar'):
        path='assets/minecraft/textures/block/oak_planks.png';hashes=BASE_PRIORITY_TEXTURES['oak_planks'];mod='domum-ornamentum-1.0.231-main.jar'
        return SimpleNamespace(sources=[{'name':client,'sha256':BASE_PRIORITY_SOURCES['minecraft-1.21.1-client.jar'],'explicitOverride':False},{'name':mod,'sha256':BASE_PRIORITY_SOURCES[mod],'explicitOverride':False},{'name':platform,'sha256':BASE_PRIORITY_PLATFORMS[platform],'explicitOverride':False}],index={path:{'variants':[{'source':client,'sha256':hashes[0]},{'source':mod,'sha256':hashes[1]}],'source':mod,'sha256':hashes[1]}},conflicts=[{'path':path}])
    def test_original_source_hashes_allow_a_client_filename_alias_and_both_audited_platforms(self):
        for client in ('1.21.1.jar','minecraft-1.21.1-client.jar'):
            for platform in BASE_PRIORITY_PLATFORMS:
                a=self.fixture(client,platform);self.assertEqual(resolve_audited_base_priority(a),list(a.index));self.assertEqual(a.conflicts,[])
    def test_unverified_inputs_are_not_resolved(self):
        for mutate in (lambda a:a.sources[2].update(sha256='0'*64),lambda a:a.sources.append(copy.copy(a.sources[0])),lambda a:a.sources[0].update(explicitOverride=True),lambda a:next(iter(a.index.values()))['variants'].append({'source':'other.jar'})):
            a=self.fixture();mutate(a);self.assertEqual(resolve_audited_base_priority(a),[]);self.assertEqual(len(a.conflicts),1)

if __name__=='__main__':unittest.main()
