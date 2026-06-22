# TEZKOR O'RNATISH QO'LLANMASI - FLOOD SIMULATSIYASINI TAKOMILLASHTIRILGAN VERSIYAGA O'TKAZING

## 📋 Tez Xulosa

ArcGIS Pro kabi yuqori sifatli simulatsiyalari bo'lgan 3 ta fayl:

| Fayl | Vazifasi |
|---|---|
| `improved-flood-simulation.ts` | Asosiy fizika motori (Manning, infiltratsiya) |
| `EnhancedFloodLayer.tsx` | React komponenti (integratsiya tayyor) |
| `INTEGRATION_GUIDE_UZ.md` | Batafsil qo'llanma |

---

## 🚀 10-MINUTLIK O'RNATISH

### 1-qadam: Fayllarni ko'chiring (2 min)

```bash
# Loyiha rootida
cp improved-flood-simulation.ts src/lib/
cp EnhancedFloodLayer.tsx src/components/
```

### 2-qadam: src/lib/flood.ts ni yangilang (3 min)

Fayl oxirida qo'shing:

```typescript
// Yangi enhanced export
export {
  enhancedShallowWaterStep,
  createVelocityField,
  calculateCFLTimestep,
  DEFAULT_FLOOD_CONFIG,
  type EnhancedFloodConfig,
  type VelocityField,
  computeEnhancedStats,
  depthToColorEnhanced,
  advancedMultiBasinFlood,
} from './improved-flood-simulation';
```

### 3-qadam: FloodLayer.tsx import'larini yangilang (2 min)

```typescript
// Qo'shing import'larga:
import {
  enhancedShallowWaterStep,
  createVelocityField,
  calculateCFLTimestep,
  DEFAULT_FLOOD_CONFIG,
  type EnhancedFloodConfig,
  computeEnhancedStats,
  depthToColorEnhanced,
} from "@/lib/flood";
```

### 4-qadam: Simulatsiya loopini yangilang (3 min)

**Topish**: Line ~230 `shallowWaterStep` calls

**O'zgartirilgan kod**:

```typescript
// Create velocity tracking
const velocities = createVelocityField(grid);
const infiltration = new Float32Array(grid.data.length);

const config = {
  manningN: 0.035,          // Trav
  infiltrationRate: 0.00001, // Juda sekin
  infiltrationDecay: 0.9,
  subIterations: 4,
  enableSubcellFlow: true,
  frictionFactor: 0.01,
};

// Adaptive timestep
const safedt = calculateCFLTimestep(grid, depths, 0.05);
const nSubsteps = Math.ceil(chunkDt / safedt);

for (let sub = 0; sub < nSubsteps; sub++) {
  const substepDt = chunkDt / nSubsteps;
  enhancedShallowWaterStep(grid, depths, config, infiltration, substepDt, velocities);
}
```

---

## ⚡ ASOSIY PARAMETRLAR

### Manning's Roughness (manningN)

```
0.03  = Trav (DEFAULT)
0.035 = O'rta trav
0.05  = Sich o'tlar
0.08  = O'rmon
```

**Nima qiladi?**: Suv qanday tezlik bilan oqadi
- **Kichik**: Tez oqim, keng tarqalish
- **Katta**: Sekin oqim, chuqur hovuzlar

### Infiltration Rate (suv toshish)

```
0        = Yo'q (default)
0.00001  = Juda sekin (asfalt)
0.0001   = Sekin (changal)
0.001    = Tez (qum)
```

**Nima qiladi?**: Suv qancha tezlik bilan yerga penetrlashadi

---

## 🎨 YANGI RANG SXEMASI

✨ **Tez oqim** = Yorq-yashil (active channels)
💧 **Suv hovuzi** = To'q ko'k (static pools)
⬜ **Quruq** = Shaffof (terrain visible)

**Farqi**: Eski versiya faqat kelinlik ko'rsatadi, yangi versiya **oqim tezligi**ni ham ko'rsatadi!

---

## ✅ TEKSHIRUV

Quyidagi qadamlarni bajarib, uning ishlayotganini tekshiring:

### Test 1: Tog'dan suv aqlashi
```
1. Og'mik terrain tanlang
2. Rainfall: 100mm, Manning: 0.03
3. Boshlang ▶️
4. Ko'rish: Suv tog'ning pastiga to'ladi ✓
```

### Test 2: Kanal oqimi
```
1. Chandi terrain tanlang
2. Rainfall: 50mm, Manning: 0.035
3. Ko'rish: Kanallar yorq rangida ✓
4. Ko'rish: Suv kanallar bo'ylab oqaydi ✓
```

### Test 3: Suv yo'qolishı (infiltration)
```
1. Tekis terrain
2. Rainfall: 50mm, Infiltration: 0.0001
3. Ko'rish: Suv asta-sekin yo'qoladi ✓
```

---

## 🔧 AGAR MUAMMO BO'LSA?

### Muammo: Suv tezligi norasyaga
**Yechim**: manningN = 0.02, infiltrationRate = 0.0001

### Muammo: Suv umuman oqimiaydi
**Yechim**: manningN = 0.05, infiltrationDecay = 0.7

### Muammo: Simulatsiya sekin
**Yechim**: infiltrationRate = 0.0001 (tezroq tugatish), subIterations = 2

### Muammo: Suv qichqichayib aylanadi
**Yechim**: calculateCFLTimestep ichida lekin subIterations = 8

---

## 📊 STATISTIKA

Endi batafsil ma'lumot olasiz:

```javascript
{
  level: 2345.5,        // Suv sirtining absolyut balandligi
  maxDepth: 5.2,        // Eng chuqur nukta
  meanDepth: 1.8,       // O'rtacha chuqunlik
  maxVelocity: 2.1,     // Eng tez oqim (m/s) 🆕
  meanVelocity: 0.3,    // O'rtacha tezlik 🆕
  totalVolume: 125000,  // Jami suv hajmi (m³) 🆕
  infiltratedVolume: 50000, // Infiltrlangan (m³) 🆕
  channelLength: 3500,  // Oqim kanal uzunligi 🆕
}
```

---

## 🎯 KEYING QADAM

1. ✅ O'rnatish (10 min)
2. ✅ Tekshirish (5 min)
3. 📊 Parametrlarni niqoblash (5 min)
4. 🚀 Production-ga

---

## 💡 MASLAHAT

**Agar birinchi marta**:
- manningN = 0.035 qoldiring
- infiltrationRate = 0 qoyib boshlang
- Keyin qadimma infiltratsiyani qo'shing

**ArcGIS Pro-ga yaqin qilish uchun**:
- Haqiqiy terrain ma'lumotlarini ishlating
- Manning's n-ni o'rta qiymatlariga sozlang
- Haqiqiy yomg'ir ma'lumotlarini ishlatilishi

---

## 📞 SAVOL-JAVOB

**S: Nima ozgaradi?**
J: Suv real jismoniy qonuniyatlar bo'yicha oqadi. Tezligi, infiltratsiyasi, kanallari ro'yxobga chiqadi.

**S: Qadim versiya ishlamay qoladi?**
J: Yo'q! Eski kod qo'llab-quvvatlanadi. Yangi kod uning ustida.

**S: Qayda ArcGIS Pro-ga o'xshaydi?**
J: Manning, infiltratsiya, oqim kanallar, statistika, samarali hisoblash.

**S: GPU acceleration bormi?**
J: Murakkab hisoblashlar vaqtli optimizatsiyaga qabul qiladi. Katta gridlar uchun WebGL qo'shish mumkin.

---

## 🎓 Qo'shimcha O'qish

- Manning's Tenglamasi: https://en.wikipedia.org/wiki/Manning_formula
- GIS Hydrology: ESRI dokumentatsiyasi
- Shallow Water: https://en.wikipedia.org/wiki/Shallow_water_equations

**Omad! 🌊**
