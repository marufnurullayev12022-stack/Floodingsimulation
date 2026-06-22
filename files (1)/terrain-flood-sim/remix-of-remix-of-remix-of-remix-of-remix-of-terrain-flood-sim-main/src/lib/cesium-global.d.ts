// Minimal globals for the CDN-loaded Cesium build.
// We avoid bundling the cesium npm package; window.Cesium comes from a <script> tag.
declare global {
  interface Window {
    Cesium: any;
    CESIUM_BASE_URL: string;
  }
}
export {};
