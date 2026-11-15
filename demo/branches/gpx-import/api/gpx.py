"""Reads a GPX track into a trail: its distance in km, its climb in m and the elevations along it."""
import math
import xml.etree.ElementTree as ET

NS = {"gpx": "http://www.topografix.com/GPX/1/1"}


def distance_km(a, b):
    """The great-circle distance between two (lat, lon) points, in km."""
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def read_track(text, name):
    """The trail a GPX document describes, named `name`. Points without an elevation (some watches drop it) are skipped."""
    points = [p for p in ET.fromstring(text).findall(".//gpx:trkpt", NS) if p.find("gpx:ele", NS) is not None]
    coords = [(float(p.get("lat")), float(p.get("lon"))) for p in points]
    elevations = [float(p.find("gpx:ele", NS).text) for p in points]
    km = sum(distance_km(a, b) for a, b in zip(coords, coords[1:]))
    climb = sum(max(0, b - a) for a, b in zip(elevations, elevations[1:]))
    return {"name": name, "km": round(km, 1), "climb": round(climb), "elevations": elevations}
