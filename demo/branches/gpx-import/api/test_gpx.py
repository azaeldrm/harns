"""Checks that a GPX track becomes a trail with the right distance and climb."""
import unittest

from gpx import read_track

TRACK = """<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>
<trkpt lat="46.0000" lon="7.0000"><ele>100</ele></trkpt>
<trkpt lat="46.0090" lon="7.0000"><ele>160</ele></trkpt>
<trkpt lat="46.0180" lon="7.0000"><ele>130</ele></trkpt>
</trkseg></trk></gpx>"""

GAPPY = """<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>
<trkpt lat="46.0000" lon="7.0000"><ele>100</ele></trkpt>
<trkpt lat="46.0045" lon="7.0000"></trkpt>
<trkpt lat="46.0090" lon="7.0000"><ele>160</ele></trkpt>
</trkseg></trk></gpx>"""


class ReadTrack(unittest.TestCase):
    def test_distance_and_climb(self):
        trail = read_track(TRACK, "Test")
        self.assertEqual(trail["km"], 2.0)
        self.assertEqual(trail["climb"], 60)

    def test_points_without_elevation_are_skipped(self):
        trail = read_track(GAPPY, "Gappy")
        self.assertEqual(trail["elevations"], [100.0, 160.0])
        self.assertEqual(trail["climb"], 60)


if __name__ == "__main__":
    unittest.main()
