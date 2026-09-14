from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from scripts import build_site


class StaticBuildTests(unittest.TestCase):
    def test_offline_build_copies_all_browser_modules_and_never_refreshes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            output = root / 'site'
            # The recursive build target is verified within this isolated temporary directory.
            self.assertTrue(output.is_relative_to(root))
            with patch.object(build_site, 'SITE_DIR', output), patch.object(build_site, 'SITE_DATA_ROOT', root/'no-data'), patch.dict('os.environ', {'DIGITAL_BALTIC_SITE_URL':''}):
                with patch.object(build_site, '_fetch_bytes', side_effect=AssertionError('No network allowed in local build test')):
                    build_site.build_site()
            for name in ['index.html','app.js','styles.css','ocean-data.mjs','data/ocean/manifest.json','locales/en.json']:
                self.assertTrue((output/name).exists(), name)
            self.assertIn('workflow_dispatch', (Path(__file__).parents[1]/'.github/workflows/update-ocean-data.yml').read_text())


if __name__ == '__main__':
    unittest.main()
