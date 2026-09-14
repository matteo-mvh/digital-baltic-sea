import unittest
import numpy as np
from data_pipeline.oxygen import bottom_values, compatible_vertical_selection
from data_pipeline.config import OCEAN_DATASETS


class BottomOxygenTests(unittest.TestCase):
    def test_local_bottom_and_dry_cells(self):
        values = np.array([[[300, 310, np.nan]], [[100, 40, np.nan]], [[0, np.nan, np.nan]]])
        actual, depths = bottom_values(values, np.array([0.5, 20, 80]), 0)
        np.testing.assert_allclose(actual, [[0, 40, np.nan]], equal_nan=True)
        np.testing.assert_allclose(depths, [[80, 20, np.nan]], equal_nan=True)
        self.assertEqual(values[0, 0, 0], 300)

    def test_depth_order_and_axis_are_explicit(self):
        values = np.array([[8, 300, 50], [np.nan, 200, 30]])
        actual, depths = bottom_values(values, [100, 1, 20], 1)
        np.testing.assert_allclose(actual, [8, 30])
        np.testing.assert_allclose(depths, [100, 20])

    def test_invalid_negative_is_not_silently_replaced_by_surface(self):
        actual, depths = bottom_values(np.array([[300], [-4]]), [1, 20], 0)
        self.assertEqual(actual[0], -4)
        self.assertEqual(depths[0], 20)

    def test_surface_only_or_ambiguous_depth_rejected(self):
        for depths in [[0], [0, 0], [0, -1], [0, np.nan]]:
            with self.assertRaises(ValueError):
                bottom_values(np.zeros((len(depths), 2)), depths, 0)

    def test_next_manual_run_requests_full_column_and_does_not_reuse_surface(self):
        config = OCEAN_DATASETS['oxygen']
        self.assertEqual(config['depth'], 'bottom')
        self.assertNotIn('vertical_subset', config)
        self.assertEqual(config['dataset_id'], 'cmems_mod_bal_bgc_anfc_P1D-m')
        self.assertFalse(compatible_vertical_selection(config, {'condition':{'depth_mode':'surface-ready-for-depth'}}))
        self.assertTrue(compatible_vertical_selection(config, {'condition':{'depth_mode':'bottom'}}))


if __name__ == '__main__':
    unittest.main()
