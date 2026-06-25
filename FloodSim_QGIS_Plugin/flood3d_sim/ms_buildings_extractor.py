# -*- coding: utf-8 -*-
"""
Microsoft Building Footprints Extractor
========================================
Berilgan hudud (bounding box yoki polygon) ichidagi barcha bino-inshootlarni
Microsoft GlobalMLBuildingFootprints ma'lumotlar bazasidan olib, GeoJSON
formatida qaytaradi. Agar binoning balandligi (height) mavjud bo'lsa,
uni atribut sifatida yozadi.

Manba: https://github.com/microsoft/GlobalMLBuildingFootprints
Litsenziya: Open Database License (ODbL)
"""

import argparse
import gzip
import io
import json
import math
import sys
import urllib.request

# Microsoft har bir region uchun quadkey-larga bo'lingan fayl ro'yxatini
# shu manzilda chop etadi (dataset-links.csv).
DATASET_LINKS_URL = (
    "https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv"
)

# Microsoft footprint-larni quadkey level 9 da bo'ladi.
TILE_ZOOM = 9


# ---------------------------------------------------------------------------
# 1-QISM:  Slippy-map tile / quadkey geometriyasi (tashqi kutubxonasiz)
# ---------------------------------------------------------------------------

def lonlat_to_tile(lon, lat, zoom):
    """Lon/lat dan (x, y) tile raqamlarini hisoblaydi."""
    lat_rad = math.radians(lat)
    n = 2 ** zoom
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    # chegaralarda chiqib ketmaslik uchun
    x = min(max(x, 0), n - 1)
    y = min(max(y, 0), n - 1)
    return x, y


def tile_to_quadkey(x, y, zoom):
    """(x, y, zoom) tile ni Bing quadkey satriga aylantiradi."""
    quadkey = []
    for i in range(zoom, 0, -1):
        digit = 0
        mask = 1 << (i - 1)
        if x & mask:
            digit += 1
        if y & mask:
            digit += 2
        quadkey.append(str(digit))
    return "".join(quadkey)


def bbox_to_quadkeys(min_lon, min_lat, max_lon, max_lat, zoom=TILE_ZOOM):
    """Bounding box bilan kesishadigan barcha quadkey-larni qaytaradi."""
    x_min, y_min = lonlat_to_tile(min_lon, max_lat, zoom)  # yuqori-chap
    x_max, y_max = lonlat_to_tile(max_lon, min_lat, zoom)  # past-o'ng
    quadkeys = set()
    for x in range(min(x_min, x_max), max(x_min, x_max) + 1):
        for y in range(min(y_min, y_max), max(y_min, y_max) + 1):
            quadkeys.add(tile_to_quadkey(x, y, zoom))
    return quadkeys


# ---------------------------------------------------------------------------
# 2-QISM:  Geometriya yordamchilari (nuqta polygon ichidami, bbox kesishuvi)
# ---------------------------------------------------------------------------

def polygon_bbox(coords):
    """Polygon ring koordinatalaridan bbox (minx, miny, maxx, maxy) ni topadi."""
    xs = [pt[0] for pt in coords]
    ys = [pt[1] for pt in coords]
    return min(xs), min(ys), max(xs), max(ys)


def bbox_intersect(a, b):
    """Ikkita bbox kesishadimi (minx, miny, maxx, maxy)."""
    return not (a[2] < b[0] or a[0] > b[2] or a[3] < b[1] or a[1] > b[3])


def point_in_ring(x, y, ring):
    """Ray-casting algoritmi: nuqta polygon ring ichidami."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        intersect = ((yi > y) != (yj > y)) and (
            x < (xj - xi) * (y - yi) / (yj - yi + 1e-20) + xi
        )
        if intersect:
            inside = not inside
        j = i
    return inside


def point_in_polygon(x, y, polygon):
    """polygon = [outer_ring, hole1, hole2, ...] (GeoJSON Polygon coordinates)."""
    if not point_in_ring(x, y, polygon[0]):
        return False
    for hole in polygon[1:]:
        if point_in_ring(x, y, hole):
            return False
    return True


def centroid(ring):
    """Ringning oddiy markaziy nuqtasi (tezkor filtr uchun yetarli)."""
    xs = [pt[0] for pt in ring]
    ys = [pt[1] for pt in ring]
    return sum(xs) / len(xs), sum(ys) / len(ys)


# ---------------------------------------------------------------------------
# 3-QISM:  AOI (qiziqish hududi) ni tayyorlash
# ---------------------------------------------------------------------------

def load_aoi(bbox=None, aoi_geojson=None):
    """
    AOI ni standart shaklga keltiradi.
    Qaytaradi: (overall_bbox, polygons_or_None)
      - overall_bbox: (min_lon, min_lat, max_lon, max_lat)
      - polygons: aniq polygon ichidagi tekshiruv uchun ro'yxat yoki None (bbox bo'lsa)
    """
    if bbox is not None:
        min_lon, min_lat, max_lon, max_lat = bbox
        return (min_lon, min_lat, max_lon, max_lat), None

    if aoi_geojson is not None:
        polygons = []
        feats = []
        gj = aoi_geojson
        if gj.get("type") == "FeatureCollection":
            feats = [f["geometry"] for f in gj["features"]]
        elif gj.get("type") == "Feature":
            feats = [gj["geometry"]]
        else:  # bare geometry
            feats = [gj]

        for geom in feats:
            if geom["type"] == "Polygon":
                polygons.append(geom["coordinates"])
            elif geom["type"] == "MultiPolygon":
                for poly in geom["coordinates"]:
                    polygons.append(poly)

        if not polygons:
            raise ValueError("AOI faylida Polygon/MultiPolygon topilmadi.")

        all_x, all_y = [], []
        for poly in polygons:
            for ring in poly:
                for pt in ring:
                    all_x.append(pt[0])
                    all_y.append(pt[1])
        overall = (min(all_x), min(all_y), max(all_x), max(all_y))
        return overall, polygons

    raise ValueError("bbox yoki aoi_geojson dan birini bering.")


# ---------------------------------------------------------------------------
# 4-QISM:  Microsoft fayl ro'yxati va yuklab olish
# ---------------------------------------------------------------------------

def fetch_dataset_links():
    """Microsoft dataset-links.csv ni yuklab oladi -> [(region, quadkey, url), ...]."""
    print("[*] Microsoft fayl ro'yxati yuklanmoqda...", file=sys.stderr)
    req = urllib.request.Request(DATASET_LINKS_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        text = resp.read().decode("utf-8", errors="replace")

    rows = []
    import csv
    reader = csv.reader(io.StringIO(text))
    header = next(reader, None)  # Location,QuadKey,Url,Size
    for row in reader:
        if len(row) < 3:
            continue
        location, quadkey, url = row[0], row[1], row[2]
        rows.append((location, quadkey, url))
    print(f"[*] Jami {len(rows)} ta tile fayli ro'yxatda mavjud.", file=sys.stderr)
    return rows


def download_tile_features(url):
    """Bitta .csv.gz tile faylini yuklab, GeoJSON Feature satrlarini qaytaradi."""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=300) as resp:
        raw = resp.read()
    # Fayllar gzip-langan; ba'zilarida "trailing garbage" bo'lishi mumkin.
    try:
        data = gzip.decompress(raw)
    except OSError:
        # qisman dekompres
        buf = io.BytesIO(raw)
        with gzip.GzipFile(fileobj=buf) as gz:
            data = gz.read()
    return data.decode("utf-8", errors="replace").splitlines()


# ---------------------------------------------------------------------------
# 5-QISM:  Asosiy ekstraksiya
# ---------------------------------------------------------------------------

def extract_buildings(bbox=None, aoi_geojson=None, out_path="buildings.geojson",
                      keep_no_height=True, precise=True, default_height=4.0):
    """
    Asosiy funksiya: AOI ichidagi binolarni GeoJSON qilib saqlaydi.

    Parametrlar:
      bbox            : (min_lon, min_lat, max_lon, max_lat) yoki None
      aoi_geojson     : GeoJSON dict (Polygon/Feature/FeatureCollection) yoki None
      out_path        : natija fayli yo'li
      keep_no_height  : balandligi yo'q (height=-1) binolarni ham saqlash
      precise         : True bo'lsa, polygon AOI bilan aniq kesishuv tekshiriladi;
                        False bo'lsa, faqat bbox bilan tezkor filtr
      default_height  : balandligi yo'q binolar uchun beriladigan standart balandlik (masalan 4.0m)
    Qaytaradi: saqlangan bino-feature lar soni
    """
    overall_bbox, polygons = load_aoi(bbox=bbox, aoi_geojson=aoi_geojson)
    min_lon, min_lat, max_lon, max_lat = overall_bbox
    print(f"[*] Hudud bbox: {overall_bbox}", file=sys.stderr)

    # 1) AOI bilan kesishadigan quadkey-larni topish
    target_quadkeys = bbox_to_quadkeys(min_lon, min_lat, max_lon, max_lat)
    print(f"[*] {len(target_quadkeys)} ta quadkey tile aniqlandi.", file=sys.stderr)

    # 2) Microsoft ro'yxatidan mos URL-larni ajratish
    links = fetch_dataset_links()
    matched = [(loc, qk, url) for (loc, qk, url) in links if qk in target_quadkeys]
    if not matched:
        print("[!] Bu hudud uchun Microsoft tile fayllari topilmadi. "
              "(Hudud qamrovga kirmasligi mumkin.)", file=sys.stderr)
    else:
        print(f"[*] {len(matched)} ta mos tile fayli yuklab olinadi.", file=sys.stderr)

    # 3) Har bir tile ni yuklab, binolarni filtrlash
    kept = 0
    skipped_height = 0

    with open(out_path, "w", encoding="utf-8") as out:
        out.write('{"type": "FeatureCollection", "features": [\n')
        first = True

        for (loc, qk, url) in matched:
            print(f"    -> {loc} / {qk} yuklanmoqda...", file=sys.stderr)
            try:
                lines = download_tile_features(url)
            except Exception as e:
                print(f"    [!] {qk} yuklab bo'lmadi: {e}", file=sys.stderr)
                continue

            for line in lines:
                line = line.strip()
                if not line:
                    continue
                try:
                    feat = json.loads(line)
                except json.JSONDecodeError:
                    continue

                geom = feat.get("geometry")
                if not geom or geom.get("type") != "Polygon":
                    continue
                coords = geom["coordinates"]
                outer = coords[0]

                # Tezkor bbox filtri
                fb = polygon_bbox(outer)
                if not bbox_intersect(fb, overall_bbox):
                    continue

                # Aniq filtr (polygon AOI bo'lsa)
                if precise and polygons is not None:
                    cx, cy = centroid(outer)
                    in_any = False
                    for poly in polygons:
                        if bbox_intersect(fb, polygon_bbox(poly[0])) and \
                           point_in_polygon(cx, cy, poly):
                            in_any = True
                            break
                    if not in_any:
                        continue
                elif polygons is None:
                    # faqat bbox holati: markaz bbox ichida bo'lsin
                    cx, cy = centroid(outer)
                    if not (min_lon <= cx <= max_lon and min_lat <= cy <= max_lat):
                        continue

                # Balandlik (height) atributini olish
                props = feat.get("properties", {}) or {}
                height = props.get("height", -1)
                confidence = props.get("confidence", -1)

                has_height = height is not None and height != -1
                if not has_height and not keep_no_height:
                    skipped_height += 1
                    continue

                # Yangi, toza atributlar bilan feature yasash
                new_props = {}
                if has_height:
                    new_props["height_m"] = round(float(height), 2)
                else:
                    new_props["height_m"] = default_height  # standart balandlik

                if confidence is not None and confidence != -1:
                    new_props["confidence"] = round(float(confidence), 3)
                new_props["source"] = "Microsoft GlobalMLBuildingFootprints"
                new_props["type"] = "polygon" # Web-ilova uchun turi polygon ekanligini bildiramiz

                out_feat = {
                    "type": "Feature",
                    "geometry": geom,
                    "properties": new_props,
                }

                if not first:
                    out.write(",\n")
                out.write(json.dumps(out_feat, ensure_ascii=False))
                first = False
                kept += 1

        out.write("\n]}\n")

    print(f"\n[✓] Tayyor! {kept} ta bino saqlandi -> {out_path}", file=sys.stderr)
    return kept

def extract_buildings_qgis_task(aoi_geojson, out_path, default_height=4.0):
    # This wrapper makes it easier to call from QGIS plugin thread
    return extract_buildings(aoi_geojson=aoi_geojson, out_path=out_path, keep_no_height=True, default_height=default_height)
