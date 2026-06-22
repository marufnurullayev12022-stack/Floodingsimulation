/// <reference types="geojson" />
import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/app-store";

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

  return <div ref={ref} className="absolute inset-0 h-full w-full" />;
}
