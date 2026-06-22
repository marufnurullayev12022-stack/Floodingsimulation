// FLOOD SIMULATION CODE EXAMPLES
// Turli sharoitlar uchun Manning's tenglama sozlamasi

// ============================================================================
// EXAMPLE 1: URBAN AREA (Shahar) - Fast runoff, low infiltration
// ============================================================================

const URBAN_CONFIG = {
  manningN: 0.012,          // Asphalt, concrete - very smooth
  infiltrationRate: 0.000001, // Almost none - paved
  infiltrationDecay: 0.95,
  subIterations: 4,
  enableSubcellFlow: true,
  frictionFactor: 0.005,
};

// NATIJA:
// - Suv tezroq oqadi (1-2 m/s)
// - Yoqqa tarqaladi (tez soliton)
// - Kanal aniq
// - Infiltratsiya yo'q

// MISOLDAN:
// 50mm yomg'ir → 45-48mm suv (minimal loss)
// Oqim tezligi: 1.5 m/s (tez va xavfli!)

// ============================================================================
// EXAMPLE 2: GRASSLAND (Trav yeri) - Default case, moderate infiltration
// ============================================================================

const GRASSLAND_CONFIG = {
  manningN: 0.035,           // Typical grass
  infiltrationRate: 0.00001, // Slow - loam soil
  infiltrationDecay: 0.9,
  subIterations: 4,
  enableSubcellFlow: true,
  frictionFactor: 0.01,
};

// NATIJA:
// - Moderate flow (0.5-1 m/s)
// - Balanced spreading
// - Some infiltration loss (2-5mm)
// - Good for agriculture areas

// MISOLDAN:
// 100mm yomg'ir → 90-95mm suv (5-10% loss)
// Oqim: 0.8 m/s (normal)

// ============================================================================
// EXAMPLE 3: FOREST (O'rmon) - High roughness, high infiltration
// ============================================================================

const FOREST_CONFIG = {
  manningN: 0.080,           // Dense vegetation and leaf litter
  infiltrationRate: 0.0001,  // Fast - forest soil is porous
  infiltrationDecay: 0.85,   // Faster decay
  subIterations: 8,          // More accurate for complex flow
  enableSubcellFlow: true,
  frictionFactor: 0.02,
};

// NATIJA:
// - Sekin oqim (0.2-0.5 m/s)
// - Katta infiltratsiya (20-30% loss)
// - Suv hamma yerga yayiladi
// - Minimal kanal formation

// MISOLDAN:
// 100mm yomg'ir → 60-70mm suv (30-40% loss!)
// Oqim: 0.3 m/s (sekin, barqaror)

// ============================================================================
// EXAMPLE 4: MOUNTAIN TERRAIN (Tog'li mintaqa) - High slope, low infiltration
// ============================================================================

const MOUNTAIN_CONFIG = {
  manningN: 0.040,           // Rocky terrain, some vegetation
  infiltrationRate: 0.00001, // Low - thin soil
  infiltrationDecay: 0.9,
  subIterations: 8,          // More iterations for stability on steep slopes
  enableSubcellFlow: true,
  frictionFactor: 0.015,
};

// NATIJA:
// - Tez oqim (1-3 m/s) - tog'lik sababli
// - Kuchli kanal formation
// - Minimal infiltratsiya
// - Debris flow risk HIGH

// MISOLDAN:
// 50mm yomg'ir → 45mm suv (minimal loss)
// Oqim: 2.5 m/s (VERY FAST!)
// Kanallar: Aniq va chuqur

// ============================================================================
// EXAMPLE 5: COASTAL LOWLAND (Qirg'oq tekisligi) - Low slope, high infiltration
// ============================================================================

const COASTAL_CONFIG = {
  manningN: 0.045,           // Mixed: sand, vegetation
  infiltrationRate: 0.001,   // Very fast - sandy soil
  infiltrationDecay: 0.8,
  subIterations: 6,
  enableSubcellFlow: true,
  frictionFactor: 0.012,
};

// NATIJA:
// - Sekin oqim (0.1-0.3 m/s)
// - Katta infiltratsiya (50-70%)
// - Suv qalqa tarqaladi
// - Havo kanal (diffuse flow)

// MISOLDAN:
// 100mm yomg'ir → 20-30mm suv (70-80% loss!)
// Oqim: 0.2 m/s
// Tarqalish: 500-1000m

// ============================================================================
// EXAMPLE 6: SLOPE STABILITY ANALYSIS (Og'miklik analizi)
// ============================================================================

// Manninig's qiymati basiga og'mikligi:
function getManningNForSlope(slopePercent) {
  if (slopePercent < 2) return 0.050;   // Flat - high roughness
  if (slopePercent < 5) return 0.040;   // Gentle
  if (slopePercent < 15) return 0.035;  // Moderate
  if (slopePercent < 30) return 0.030;  // Steep
  return 0.025;                          // Very steep - natural channelization
}

// Infiltratsiya shuningdek og'miklikka bog'liq:
function getInfiltrationForSlope(slopePercent) {
  if (slopePercent < 2) return 0.0001;  // Flat - water sits, infiltrates more
  if (slopePercent < 10) return 0.00005;
  if (slopePercent < 20) return 0.00001;
  return 0.000001;                       // Steep - runoff before infiltration
}

// ============================================================================
// EXAMPLE 7: RAINSTORM SCENARIO (Yomg'ir shiddati)
// ============================================================================

// Draught period - fast infiltration
const DRAUGHT_SEASON = {
  manningN: 0.035,
  infiltrationRate: 0.0005,  // MUCH HIGHER - dry soil absorbs quickly
  infiltrationDecay: 0.7,    // Fast decay
  subIterations: 4,
};
// Natija: 10-20% suv tinib qoladi, ko'p infiltrlashadi

// Wet season - slow infiltration
const WET_SEASON = {
  manningN: 0.035,
  infiltrationRate: 0.00001,  // MUCH LOWER - soil saturated
  infiltrationDecay: 0.99,    // Very slow decay
  subIterations: 6,
};
// Natija: 80-90% suv sirtida qoladi, katta suv aylanma

// ============================================================================
// EXAMPLE 8: HAZARD ASSESSMENT (Xavf baholash)
// ============================================================================

interface FloodHazard {
  depthMeters: number;
  velocityMetersSec: number;
  hazardLevel: "low" | "moderate" | "high" | "very-high";
  description: string;
}

function assessFloodHazard(depth, velocity): FloodHazard {
  // UK EA (Environment Agency) criteria
  const hazardIndex = depth * velocity;

  if (hazardIndex < 0.5) {
    return {
      depthMeters: depth,
      velocityMetersSec: velocity,
      hazardLevel: "low",
      description: "Safe for evacuation and wading",
    };
  } else if (hazardIndex < 1.5) {
    return {
      depthMeters: depth,
      velocityMetersSec: velocity,
      hazardLevel: "moderate",
      description: "Difficult movement, danger to children and elderly",
    };
  } else if (hazardIndex < 3.0) {
    return {
      depthMeters: depth,
      velocityMetersSec: velocity,
      hazardLevel: "high",
      description: "Very difficult movement, danger to adults",
    };
  } else {
    return {
      depthMeters: depth,
      velocityMetersSec: velocity,
      hazardLevel: "very-high",
      description: "Danger to life, evacuation mandatory",
    };
  }
}

// MISOLDAN HAZARD ASSESSMENT:
// Urban flood (mannningN=0.012):
//   depth=0.5m, velocity=1.5 m/s
//   hazard = 0.5 × 1.5 = 0.75 → MODERATE
//   ⚠️ Evacuation needed

// Forest flood (mannningN=0.080):
//   depth=0.5m, velocity=0.3 m/s
//   hazard = 0.5 × 0.3 = 0.15 → LOW
//   ✅ Can evacuate calmly

// ============================================================================
// EXAMPLE 9: DYNAMIC CONFIG SELECTION (Avtomatik tanlov)
// ============================================================================

interface TerrainType {
  name: string;
  config: EnhancedFloodConfig;
}

const TERRAIN_DATABASE: Record<string, TerrainType> = {
  urban: { name: "Urban Area", config: URBAN_CONFIG },
  grassland: { name: "Grassland", config: GRASSLAND_CONFIG },
  forest: { name: "Forest", config: FOREST_CONFIG },
  mountain: { name: "Mountain", config: MOUNTAIN_CONFIG },
  coastal: { name: "Coastal Lowland", config: COASTAL_CONFIG },
};

function selectConfigByTerrainType(type: string): EnhancedFloodConfig {
  const terrain = TERRAIN_DATABASE[type];
  if (!terrain) {
    console.warn(`Unknown terrain type: ${type}, using default`);
    return DEFAULT_FLOOD_CONFIG;
  }
  return terrain.config;
}

// ISHLATISH:
// const config = selectConfigByTerrainType("forest");
// enhancedShallowWaterStep(grid, depths, config, infiltration, dt, velocities);

// ============================================================================
// EXAMPLE 10: CALIBRATION FROM OBSERVED DATA (Haqiqiy ma'lumotdan kalibr)
// ============================================================================

interface ObservedFlood {
  rainfallMm: number;
  peakDepthM: number;
  peakVelocityMs: number;
  flowDistanceKm: number;
  durationHours: number;
}

function calibrateConfigFromObservation(observed: ObservedFlood): EnhancedFloodConfig {
  // Start with default
  let config = { ...DEFAULT_FLOOD_CONFIG };

  // If water spread far: decrease manningN
  if (observed.flowDistanceKm > 5) {
    config.manningN = 0.025; // Less friction
  }

  // If water stayed localized: increase manningN
  if (observed.flowDistanceKm < 0.5) {
    config.manningN = 0.060; // More friction
  }

  // If peak velocity was high: decrease manningN
  if (observed.peakVelocityMs > 1.5) {
    config.manningN = 0.020;
  }

  // If water disappeared fast: increase infiltration
  if (observed.durationHours < 3) {
    config.infiltrationRate = 0.0001;
    config.infiltrationDecay = 0.8;
  }

  // If water stayed long: decrease infiltration
  if (observed.durationHours > 24) {
    config.infiltrationRate = 0.000001;
    config.infiltrationDecay = 0.99;
  }

  return config;
}

// MISOLDAN CALIBRATION:
// Observed: Heavy rain, water spread 10km, peak velocity 2 m/s, lasted 5 hours
// const observed = {
//   rainfallMm: 200,
//   peakDepthM: 1.5,
//   peakVelocityMs: 2.0,
//   flowDistanceKm: 10,
//   durationHours: 5,
// };
// const config = calibrateConfigFromObservation(observed);
// Result: manningN=0.020, infiltrationRate=0.00005 (minimal)

// ============================================================================
// EXAMPLE 11: GIS EXPORT FOR ARCGIS (ArcGIS uchun export)
// ============================================================================

function exportToGeoJSON(grid, depths, velocities) {
  const features = [];

  for (let i = 0; i < depths.length; i++) {
    if (depths[i] < 0.01) continue; // Skip dry cells

    const r = Math.floor(i / grid.nCols);
    const c = i % grid.nCols;

    // Convert grid coordinates to lat/lon
    const [w, s, e, n] = grid.bbox;
    const lng = w + (c + 0.5) * ((e - w) / grid.nCols);
    const lat = s + (r + 0.5) * ((n - s) / grid.nRows);

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [lng, lat],
      },
      properties: {
        depth_m: depths[i],
        velocity_ms: velocities.magnitude[i],
        hazard_index: depths[i] * velocities.magnitude[i],
        elevation_m: grid.data[i],
        water_surface_m: grid.data[i] + depths[i],
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

// ============================================================================
// EXAMPLE 12: CALIBRATION TIPS (Maslahatlar)
// ============================================================================

/*
MANNING'S N TANLOV:

1. Birinchi = DEFAULT (0.035)
   - Ko'proq loyihalarda ishchi qiymat
   
2. Agar suv TEZROQ OQISHI KERAK:
   - manningN ni KAMAYTIRING (0.025-0.030)
   - NATIJA: Fast flow, far spreading
   
3. Agar suv SEKINROQ OQISHI KERAK:
   - manningN ni OSHIRING (0.050-0.080)
   - NATIJA: Slow flow, pooling
   
4. Haqiqiy FOTO-O'LCHASHLAR bilsangiz:
   - V = (1/n) * R^(2/3) * S^(1/2) dan orqaga
   - Manning's n ni cal ibrate qiling

İNFİLTRATSİYA TANLOV:

1. Birinchi = MINIMAL (0.000001-0.00001)
   - Ko'roq xavfni shirish uchun
   
2. Agar TOO'T JOYNING SUVI yo'q:
   - infiltrationRate ni OSHIRING
   - NATIJA: Water disappears quickly
   
3. Agar FLOOD TO'P QOLSA:
   - infiltrationRate ni KAMAYTIRING
   - NATIJA: Water persists longer

HAQIQIY LOYIHALAR:
- Field tests yoki historical floods bilan kalibr qiling
- Manning's n va infiltratsiyani bir paytda o'zgartirmang
- Bitta parametrni o'zgartiring, natijani ko'ring
*/

// Happy flood modeling! 🌊
