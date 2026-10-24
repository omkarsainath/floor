import base64
import io
import sys
import unittest
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from wall_relief import decode_image, normalize_depth

class ReliefTests(unittest.TestCase):
    def test_invalid_upload(self):
        for value in [None, 'https://example.com/a.png', 'data:image/svg+xml;base64,AAAA', 'data:image/png;base64,!!!']:
            with self.assertRaises(ValueError):
                decode_image(value)

    def test_decode_preserves_aspect(self):
        output = io.BytesIO()
        Image.new('RGB', (2000, 1000), 'red').save(output, 'PNG')
        result = decode_image('data:image/png;base64,' + base64.b64encode(output.getvalue()).decode())
        self.assertEqual(result.size, (1536, 768))

    def test_depth_is_finite_and_flat_input_is_flat(self):
        self.assertFalse(normalize_depth(np.ones((20, 20))).any())
        result = normalize_depth(np.arange(400).reshape(20, 20))
        self.assertGreater(result[-1,-1], result[0,0])
        with self.assertRaises(ValueError):
            normalize_depth(np.array([[float('nan')]]))

if __name__ == '__main__':
    unittest.main()
