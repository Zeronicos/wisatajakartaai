import json, urllib.request
q = """
[out:json][timeout:25];
(
  node["tourism"](around:5000,-6.35,106.90);
  way["tourism"](around:5000,-6.35,106.90);
  node["leisure"="park"](around:5000,-6.332,106.876);
  way["leisure"="park"](around:5000,-6.332,106.876);
);
out center 20;
"""
req = urllib.request.Request(
    "https://overpass-api.de/api/interpreter",
    data=q.encode(),
    headers={"User-Agent": "WisataJakartaAI/1.0"},
)
with urllib.request.urlopen(req, timeout=40) as r:
    data = json.loads(r.read().decode())
for e in data.get("elements", []):
    tags = e.get("tags", {})
    name = tags.get("name") or tags.get("name:en") or "?"
    lat = e.get("lat") or (e.get("center") or {}).get("lat")
    lon = e.get("lon") or (e.get("center") or {}).get("lon")
    if lat and lon and name != "?":
        print(f"{name}|{lat}|{lon}")
