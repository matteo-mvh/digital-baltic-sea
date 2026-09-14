"""Exercise metadata packaging offline; never initialize the download client."""
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image, PngImagePlugin  # Register PNG before the temporary import stubs.

# These imports are only needed by download/extraction paths not exercised here.
# Any accidental attempt to use the download client fails because it has no API.
with patch.dict('sys.modules', {
    'copernicusmarine': types.ModuleType('copernicusmarine'),
    'xarray': types.SimpleNamespace(Dataset=object, DataArray=object),
    'dotenv': types.SimpleNamespace(load_dotenv=lambda: None),
}):
    from scripts import update_copernicus as pipeline


class PreservedMetadataTests(unittest.TestCase):
    def test_failed_bottom_update_cannot_relabel_or_redate_surface_archive(self):
        old_condition = dict(pipeline.ocean_condition_definitions()['oxygen'], label='Oxygen', depth_mode='surface-ready-for-depth')
        old = {'condition': old_condition, 'provenance': {'retrieved_at_utc': '2026-08-20T04:26:10Z', 'type': 'Modelled analysis and forecast'}}
        frame = pipeline.FrameBundle(
            key='2026-08-20T00-00-00Z', time_utc='2026-08-20T00:00:00Z',
            latitudes=np.array([59., 60.]), longitudes=np.array([19.,20.]),
            values=np.array([[200.,210.],[220.,np.nan]]), components={},
            min_value=200, max_value=220, original_units='mmol m-3',
            converted_from_kelvin=False, raw_bytes=0, source='carried',
        )
        # TemporaryDirectory creates the checked, isolated output root for packaging only.
        with tempfile.TemporaryDirectory() as directory, patch.object(pipeline, 'SITE_OCEAN_ROOT', Path(directory)):
            output = pipeline._build_condition_outputs(pipeline.OCEAN_DATASETS['oxygen'], [frame], 1, 0, preserved_metadata=old)
            self.assertEqual(output['provenance'], old['provenance'])
            self.assertEqual(output['condition']['depth_mode'], 'surface-ready-for-depth')
            self.assertNotIn('depth_label', output)
            pipeline._write_root_manifest({'oxygen':output})
            root = json.loads((Path(directory)/'manifest.json').read_text())
            oxygen = next(entry for entry in root['conditions'] if entry['id']=='oxygen')
            self.assertEqual(oxygen['condition']['depth_mode'], 'surface-ready-for-depth')
            self.assertEqual(oxygen['metadata']['provenance']['retrieved_at_utc'], old['provenance']['retrieved_at_utc'])

    def test_surface_frames_are_not_restored_into_bottom_series(self):
        restored = pipeline._restore_frames(pipeline.OCEAN_DATASETS['oxygen'], [], set(), {'condition':{'depth_mode':'surface'}}, {'latitudes':[1]}, {})
        self.assertEqual(restored, [])

    def test_negative_source_rejected_but_signed_scale_retained(self):
        with self.assertRaises(ValueError):
            pipeline._nice_display_range(np.array([-1.,1.]), nonnegative=True)
        lower, upper = pipeline._nice_display_range(np.array([-1.,1.]))
        self.assertLess(lower, 0)
        self.assertGreater(upper, 0)


if __name__ == '__main__':
    unittest.main()
