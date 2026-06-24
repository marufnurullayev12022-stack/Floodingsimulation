/// <reference types="geojson" />
import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/app-store";
import * as turf from "@turf/turf";

export function CesiumViewer() {
  const ref = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const ionToken = useAppStore((s) => s.ionToken);
  const geojson = useAppStore((s) => s.geojson);
  const setStatus = useAppStore((s) => s.setStatus);
  const mode = useAppStore((s) => s.mode);
  const pointSource = useAppStore((s) => s.pointSource);
  const setPointSource = useAppStore((s) => s.setPointSource);
  const clipToBoundary = useAppStore((s) => s.clipToBoundary);

  // 3D Object builder states
  const drawMode = useAppStore((s) => s.drawMode);
  const setDrawMode = useAppStore((s) => s.setDrawMode);
  const drawPoints = useAppStore((s) => s.drawPoints);
  const setDrawPoints = useAppStore((s) => s.setDrawPoints);
  const activeObject = useAppStore((s) => s.activeObject);
  const setActiveObject = useAppStore((s) => s.setActiveObject);
  const addCustomObject = useAppStore((s) => s.addCustomObject);
  const customObjects = useAppStore((s) => s.customObjects);
  const customObjectsCountRef = useRef(0);

  const drawPointsRef = useRef<{ lng: number; lat: number }[]>([]);

  // Sync ref with drawMode changes
  useEffect(() => {
    if (drawMode !== "none") {
      drawPointsRef.current = [];
    }
  }, [drawMode]);

  // Initialise viewer once Cesium global is available.
  useEffect(() => {
    let cancelled = false;
    const tryInit = () => {
      if (cancelled || viewerRef.current || !ref.current) return;
      const Cesium = window.Cesium;
      if (!Cesium) {
        setTimeout(tryInit, 200);
        return;
      }
      if (ionToken) Cesium.Ion.defaultAccessToken = ionToken;

      // Free terrain: ArcGIS World Elevation 3D (no token required).
      // If user provides Cesium ion token, we upgrade to World Terrain.
      let terrain: any = undefined;
      try {
        if (ionToken) {
          terrain = Cesium.Terrain.fromWorldTerrain();
        } else {
          const provider = Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(
            "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer",
          );
          terrain = new Cesium.Terrain(provider);
        }
      } catch (e) {
        console.warn("Terrain init failed, using ellipsoid", e);
      }

      // Free satellite imagery: Google Satellite tiles (mt0–mt3 subdomains).
      const baseLayer = Cesium.ImageryLayer.fromProviderAsync(
        Promise.resolve(
          new Cesium.UrlTemplateImageryProvider({
            url: "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
            subdomains: ["0", "1", "2", "3"],
            maximumLevel: 20,
            credit: "Imagery © Google",
          }),
        ),
      );

      const viewer = new Cesium.Viewer(ref.current, {
        terrain,
        baseLayer,
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        contextOptions: {
          webgl: {
            preserveDrawingBuffer: true,
          },
        },
      });
      viewer.scene.globe.depthTestAgainstTerrain = true;
      viewer.scene.skyAtmosphere.show = true;
      viewer.scene.globe.enableLighting = false;
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#f8f9fa"); // Oq qutblar (muzlik)
      viewerRef.current = viewer;
      (window as any).__viewer = viewer;
      setStatus(
        ionToken
          ? "Globe ready (Cesium World Terrain). Load a GeoJSON polygon."
          : "Globe ready (free ArcGIS terrain + OSM imagery). Load a GeoJSON polygon.",
      );
    };
    tryInit();
    return () => {
      cancelled = true;
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
    // Re-init when the token is added/removed so terrain provider swaps cleanly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ionToken]);

  // Draw boundary + fly to area + clip globe to boundary whenever geojson changes.
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (!viewer || !Cesium) return;

    // Clear previous boundary entities
    const toRemove = viewer.entities.values.filter(
      (e: any) => e.name === "boundary" || e.name === "outside-mask",
    );
    toRemove.forEach((e: any) => viewer.entities.remove(e));

    // Clear previous clipping
    if (viewer.scene.globe.clippingPolygons) {
      try {
        viewer.scene.globe.clippingPolygons.removeAll?.();
        viewer.scene.globe.clippingPolygons = undefined;
      } catch (e) {}
    }

    if (!geojson) return;

    const polys: GeoJSON.Position[][][] =
      geojson.geometry.type === "Polygon"
        ? [geojson.geometry.coordinates as GeoJSON.Position[][]]
        : (geojson.geometry.coordinates as GeoJSON.Position[][][]);

    let allLngLat: number[] = [];
    const clipPolygons: any[] = [];

    polys.forEach((rings) => {
      const outer = rings[0];
      const positions = outer.flatMap(([lng, lat]) => [lng, lat]);
      allLngLat = allLngLat.concat(positions);

      // Boundary outline
      viewer.entities.add({
        name: "boundary",
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(positions),
          width: 3,
          material: Cesium.Color.fromCssColorString("#22d3ee"),
          clampToGround: true,
        },
      });

      if (clipToBoundary && Cesium.ClippingPolygon && Cesium.ClippingPolygonCollection) {
        try {
          clipPolygons.push(
            new Cesium.ClippingPolygon({
              positions: Cesium.Cartesian3.fromDegreesArray(positions),
            }),
          );
        } catch (e) {
          console.warn("ClippingPolygon failed", e);
        }
      }
    });

    // Apply clipping if enabled
    if (clipToBoundary && clipPolygons.length && Cesium.ClippingPolygonCollection) {
      try {
        viewer.scene.globe.clippingPolygons = new Cesium.ClippingPolygonCollection({
          polygons: clipPolygons,
          inverse: true, // invert => clip everything OUTSIDE the polygons
        });
      } catch (e) {
        console.warn("clippingPolygons not supported in this Cesium build", e);
      }
    }

    if (allLngLat.length >= 4) {
      const lngs = allLngLat.filter((_, i) => i % 2 === 0);
      const lats = allLngLat.filter((_, i) => i % 2 === 1);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const rect = Cesium.Rectangle.fromDegrees(minLng, minLat, maxLng, maxLat);
      // Build a bounding sphere from rectangle corners so the camera frames the
      // whole area centred in view at an appropriate zoom regardless of size.
      const corners = [
        Cesium.Cartesian3.fromDegrees(minLng, minLat),
        Cesium.Cartesian3.fromDegrees(maxLng, minLat),
        Cesium.Cartesian3.fromDegrees(maxLng, maxLat),
        Cesium.Cartesian3.fromDegrees(minLng, maxLat),
        Cesium.Cartesian3.fromDegrees((minLng + maxLng) / 2, (minLat + maxLat) / 2),
      ];
      const sphere = Cesium.BoundingSphere.fromPoints(corners);
      viewer.camera.flyToBoundingSphere(sphere, {
        duration: 1.8,
        offset: new Cesium.HeadingPitchRange(
          0,
          Cesium.Math.toRadians(-55),
          sphere.radius * 2.4,
        ),
      });
      void rect;
    }
  }, [geojson, clipToBoundary]);

  // Click handler for point-source placement
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (!viewer || !Cesium) return;
    if (mode !== "point") {
      viewer.canvas.style.cursor = "";
      return;
    }
    viewer.canvas.style.cursor = "crosshair";
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    handler.setInputAction((click: any) => {
      const ray = viewer.camera.getPickRay(click.position);
      if (!ray) return;
      const cart = viewer.scene.globe.pick(ray, viewer.scene);
      if (!cart) return;
      const carto = Cesium.Cartographic.fromCartesian(cart);
      const lng = Cesium.Math.toDegrees(carto.longitude);
      const lat = Cesium.Math.toDegrees(carto.latitude);
      setPointSource({ lng, lat });
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    return () => {
      handler.destroy();
      viewer.canvas.style.cursor = "";
    };
  }, [mode, setPointSource]);

  // Render point-source marker
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (!viewer || !Cesium) return;
    viewer.entities.values
      .filter((e: any) => e.name === "point-source")
      .forEach((e: any) => viewer.entities.remove(e));
    if (!pointSource) return;
    viewer.entities.add({
      name: "point-source",
      position: Cesium.Cartesian3.fromDegrees(pointSource.lng, pointSource.lat),
      point: {
        pixelSize: 14,
        color: Cesium.Color.fromCssColorString("#38bdf8"),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: "💧 source",
        font: "12px sans-serif",
        pixelOffset: new Cesium.Cartesian2(0, -24),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }, [pointSource]);

  // Click handler for 2D footprint drawing (box / polygon)
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (!viewer || !Cesium) return;
    if (drawMode === "none") return;

    viewer.canvas.style.cursor = "crosshair";
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

    // Robust coordinate picking helper
    const pickCoordinates = (position: any) => {
      let cart;
      if (viewer.scene.pickPositionSupported) {
        try {
          cart = viewer.scene.pickPosition(position);
        } catch (e) {}
      }
      if (!cart) {
        const ray = viewer.camera.getPickRay(position);
        if (ray) {
          cart = viewer.scene.globe.pick(ray, viewer.scene);
        }
      }
      if (!cart) {
        cart = viewer.camera.pickEllipsoid(position, viewer.scene.globe.ellipsoid);
      }
      return cart;
    };

    // Helper to check if new point is too close to the last added point
    const isCloseToLast = (lng: number, lat: number) => {
      const pts = drawPointsRef.current;
      if (pts.length === 0) return false;
      const last = pts[pts.length - 1];
      const fromPt = turf.point([last.lng, last.lat]);
      const toPt = turf.point([lng, lat]);
      const dist = turf.distance(fromPt, toPt, { units: "meters" });
      return dist < 1.0; // 1 meter threshold
    };

    handler.setInputAction((click: any) => {
      const cart = pickCoordinates(click.position);
      if (!cart) return;
      
      const carto = Cesium.Cartographic.fromCartesian(cart);
      const lng = Cesium.Math.toDegrees(carto.longitude);
      const lat = Cesium.Math.toDegrees(carto.latitude);

      if (drawMode === "box") {
        if (drawPointsRef.current.length === 0) {
          // First point of box (Point A)
          drawPointsRef.current = [{ lng, lat }];
          setDrawPoints([{ lng, lat }]);
          setStatus("Burchak 1 tanlandi. Qarama-qarshi burchakni belgilash uchun xaritaga bosing.");
        } else {
          // Second point of box (Point B)
          if (isCloseToLast(lng, lat)) return;

          const ptA = drawPointsRef.current[0];
          const ptB = { lng, lat };

          // Define the 4 corners of the rectangle
          const positions = [
            { lng: ptA.lng, lat: ptA.lat },
            { lng: ptB.lng, lat: ptA.lat },
            { lng: ptB.lng, lat: ptB.lat },
            { lng: ptA.lng, lat: ptB.lat },
          ];

          // Calculate center, length, and width using Turf
          const centerLng = (ptA.lng + ptB.lng) / 2;
          const centerLat = (ptA.lat + ptB.lat) / 2;

          const fromPt = turf.point([ptA.lng, ptA.lat]);
          const toPtNS = turf.point([ptA.lng, ptB.lat]);
          const toPtEW = turf.point([ptB.lng, ptA.lat]);

          const length = turf.distance(fromPt, toPtNS, { units: "meters" });
          const width = turf.distance(fromPt, toPtEW, { units: "meters" });

          setActiveObject({
            id: "temp",
            type: "box",
            name: "Yangi Bino",
            center: { lng: centerLng, lat: centerLat },
            length: Math.max(1, parseFloat(length.toFixed(1))),
            width: Math.max(1, parseFloat(width.toFixed(1))),
            positions: positions,
            height: 15, // default height in meters
            wallWidth: 0, // default solid
            color: "#fb923c",
          });
          drawPointsRef.current = [];
          setDrawPoints([]);
          setDrawMode("none");
          setStatus("To'rtburchak bino chizildi. Sozlamalarni kiritib 'Saqlash' tugmasini bosing.");
        }
      } else if (drawMode === "polygon" || drawMode === "line") {
        if (isCloseToLast(lng, lat)) return;
        drawPointsRef.current.push({ lng, lat });
        setDrawPoints([...drawPointsRef.current]);
        const modeLabel = drawMode === "line" ? "Devor chizilmoqda" : "Polygon chizilmoqda";
        setStatus(`${modeLabel}: ${drawPointsRef.current.length} nuqta. Tugatish uchun ikki marta bosing.`);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Double click to finish drawing — open modal for params
    handler.setInputAction((click: any) => {
      if (drawMode !== "polygon" && drawMode !== "line") return;

      const pts = drawPointsRef.current;
      const minPts = drawMode === "polygon" ? 3 : 2;
      if (pts.length < minPts) {
        setStatus(`Kamida ${minPts} ta nuqta kerak!`);
        return;
      }

      // Filter duplicates
      const uniquePts = pts.filter((pt, index, self) =>
        index === self.findIndex((p) => {
          const d = turf.distance(turf.point([p.lng, p.lat]), turf.point([pt.lng, pt.lat]), { units: "meters" });
          return d < 0.5;
        })
      );

      if (uniquePts.length < minPts) {
        setStatus(`Kamida ${minPts} ta nuqta kerak!`);
        return;
      }

      // Open modal with default values — user sets height/width/color
      setActiveObject({
        id: "temp",
        type: drawMode,
        name: drawMode === "line" ? "Yangi Devor" : "Yangi Bino",
        positions: uniquePts,
        height: drawMode === "line" ? 3 : 15,
        wallWidth: drawMode === "line" ? 0.5 : 0,
        color: drawMode === "line" ? "#64748b" : "#fb923c",
      });

      drawPointsRef.current = [];
      setDrawPoints([]);
      setDrawMode("none");
      setStatus(drawMode === "line"
        ? "Devor chizildi. Eni va balandligini kiriting."
        : "Bino chizildi. Balandligini kiriting.");
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    return () => {
      handler.destroy();
      viewer.canvas.style.cursor = "";
    };
  }, [drawMode, setDrawPoints, setActiveObject, setDrawMode, setStatus]);

  // Sync customObjects & temporary drawing previews with Cesium (clamping to terrain)
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (!viewer || !Cesium) return;

    // 1. Remove previous custom object entities
    const oldEntities = viewer.entities.values.filter(
      (e: any) =>
        e.name?.startsWith("custom-obj-") ||
        e.name === "temp-draw-obj" ||
        e.name?.startsWith("temp-draw-point-") ||
        e.name === "temp-draw-line"
    );
    oldEntities.forEach((e: any) => viewer.entities.remove(e));

    // Helper to draw objects with perfect terrain-clamping
    const createObjectEntity = (obj: any, isPreview = false) => {
      const entityId = isPreview ? "temp-draw-obj" : `custom-obj-${obj.id}`;
      const color = Cesium.Color.fromCssColorString(obj.color).withAlpha(isPreview ? 0.6 : 0.85);

      if (obj.positions) {
        if (obj.wallWidth && obj.wallWidth > 0) {
          // Render as extruded corridor (closed loop if box, or open/closed path if polygon)
          const points = obj.type === "box" ? [...obj.positions, obj.positions[0]] : obj.positions;
          viewer.entities.add({
            name: entityId,
            corridor: {
              positions: points.map((p: any) => Cesium.Cartesian3.fromDegrees(p.lng, p.lat)),
              width: obj.wallWidth,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              extrudedHeightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
              extrudedHeight: obj.height,
              material: color,
              outline: true,
              outlineColor: Cesium.Color.BLACK,
            },
            label: isPreview ? undefined : {
              text: obj.name,
              font: "12px sans-serif",
              position: Cesium.BoundingSphere.fromPoints(
                obj.positions.map((p: any) => Cesium.Cartesian3.fromDegrees(p.lng, p.lat))
              ).center,
              pixelOffset: new Cesium.Cartesian2(0, -obj.height - 15),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            },
          });
        } else {
          // Render as solid extruded polygon (snaps to terrain seamlessly)
          viewer.entities.add({
            name: entityId,
            polygon: {
              hierarchy: new Cesium.PolygonHierarchy(
                obj.positions.map((p: any) => Cesium.Cartesian3.fromDegrees(p.lng, p.lat))
              ),
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              extrudedHeightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
              extrudedHeight: obj.height,
              material: color,
              outline: true,
              outlineColor: Cesium.Color.BLACK,
            },
            label: isPreview ? undefined : {
              text: obj.name,
              font: "12px sans-serif",
              position: Cesium.BoundingSphere.fromPoints(
                obj.positions.map((p: any) => Cesium.Cartesian3.fromDegrees(p.lng, p.lat))
              ).center,
              pixelOffset: new Cesium.Cartesian2(0, -obj.height - 15),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            },
          });
        }
      }
    };

    // 2. Render saved custom objects
    customObjects.forEach((obj: any) => createObjectEntity(obj, false));

    // 3. Render active object preview
    if (activeObject) {
      createObjectEntity(activeObject, true);
    }

    // 4. Render drawing dots/lines
    if (drawPoints.length > 0) {
      drawPoints.forEach((pt, index) => {
        viewer.entities.add({
          name: `temp-draw-point-${index}`,
          position: Cesium.Cartesian3.fromDegrees(pt.lng, pt.lat),
          point: {
            pixelSize: 10,
            color: Cesium.Color.RED,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 1.5,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      });

      if (drawPoints.length > 1) {
        const positions = drawPoints.map((pt) => Cesium.Cartesian3.fromDegrees(pt.lng, pt.lat));
        viewer.entities.add({
          name: "temp-draw-line",
          polyline: {
            positions: positions,
            width: 3,
            material: new Cesium.PolylineDashMaterialProperty({
              color: Cesium.Color.YELLOW,
            }),
            clampToGround: true,
          },
        });
      }
    }
  }, [customObjects, activeObject, drawPoints]);

  return <div ref={ref} className="absolute inset-0 h-full w-full" />;
}
