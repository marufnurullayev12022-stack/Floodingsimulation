import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Building2, Box, Shapes, Check, X, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function RightPanel() {
  const {
    drawMode,
    setDrawMode,
    drawPoints,
    setDrawPoints,
    activeObject,
    setActiveObject,
    customObjects,
    addCustomObject,
    removeCustomObject,
    clearCustomObjects,
  } = useAppStore();

  const handleBoxDimensionChange = (field: "length" | "width", val: number) => {
    if (!activeObject || !activeObject.center) return;
    const length = field === "length" ? val : (activeObject.length || 10);
    const width = field === "width" ? val : (activeObject.width || 10);
    const center = activeObject.center;

    const latRads = (center.lat * Math.PI) / 180;
    const metersPerDegLat = 111320;
    const metersPerDegLng = 111320 * Math.cos(latRads);

    const halfLenDeg = (length / 2) / metersPerDegLat;
    const halfWidDeg = (width / 2) / metersPerDegLng;

    const positions = [
      { lng: center.lng - halfWidDeg, lat: center.lat - halfLenDeg },
      { lng: center.lng + halfWidDeg, lat: center.lat - halfLenDeg },
      { lng: center.lng + halfWidDeg, lat: center.lat + halfLenDeg },
      { lng: center.lng - halfWidDeg, lat: center.lat + halfLenDeg },
    ];

    setActiveObject({
      ...activeObject,
      length,
      width,
      positions,
    });
  };

  return (
    <aside className="pointer-events-auto absolute right-4 top-4 z-10 flex max-h-[calc(100vh-2rem)] w-[360px] flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-card/90 p-5 shadow-2xl backdrop-blur-xl">
      <header>
        <h2 className="flex items-center gap-2 text-md font-semibold tracking-tight text-cyan-400">
          <Building2 className="h-5 w-5 text-cyan-400" />
          3D Obyektlar Tuzuvchi (ArcGIS Pro)
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Xaritada 3D binolar, devorlar va inshootlarni qo'lda tiklash
        </p>
      </header>

      <Separator />

      {/* Drawing Controls */}
      <section className="space-y-3">
        {drawMode === "none" && !activeObject && (
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-9 text-xs font-medium border-cyan-500/20 hover:border-cyan-500/50 hover:bg-cyan-500/5"
              onClick={() => setDrawMode("box")}
            >
              <Box className="mr-1.5 h-3.5 w-3.5 text-cyan-400" />
              To'rtburchak Bino
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 text-xs font-medium border-cyan-500/20 hover:border-cyan-500/50 hover:bg-cyan-500/5"
              onClick={() => setDrawMode("polygon")}
            >
              <Shapes className="mr-1.5 h-3.5 w-3.5 text-cyan-400" />
              Ko'pburchak Devor/Bino
            </Button>
          </div>
        )}

        {drawMode !== "none" && (
          <div className="rounded-md bg-yellow-500/10 border border-yellow-500/30 p-3 text-xs space-y-2.5">
            <div className="text-yellow-400 flex items-center gap-1.5 font-medium">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-yellow-400" />
              {drawMode === "box" ? (
                drawPoints.length === 0 ? (
                  <span>Xaritadan 1-burchakni tanlang...</span>
                ) : (
                  <span>2-burchakni (qarama-qarshi) tanlang...</span>
                )
              ) : (
                <span>
                  Ko'pburchak chizilmoqda... Nuqta qo'ying ({drawPoints.length})
                </span>
              )}
            </div>
            {drawMode === "polygon" && (
              <p className="text-[10px] text-muted-foreground">
                Tugatish uchun xaritada oxirgi nuqtani <strong>ikki marta bosing (double-click)</strong>.
              </p>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs flex-1"
                onClick={() => setDrawMode("none")}
              >
                <X className="mr-1 h-3 w-3" /> Bekor qilish
              </Button>
            </div>
          </div>
        )}

        {/* Active Object Configuration Form */}
        {activeObject && (
          <div className="rounded-md border border-cyan-500/30 bg-cyan-950/20 p-3.5 space-y-3 text-xs">
            <div className="font-semibold text-cyan-300">Yangi Obyekt Sozlamalari</div>

            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Obyekt Nomi</Label>
              <Input
                className="h-8 text-xs bg-background/50"
                value={activeObject.name}
                onChange={(e) =>
                  setActiveObject({ ...activeObject, name: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Balandligi (m)</Label>
                <Input
                  type="number"
                  min={1}
                  className="h-8 text-xs bg-background/50"
                  value={activeObject.height}
                  onChange={(e) =>
                    setActiveObject({
                      ...activeObject,
                      height: Math.max(1, Number(e.target.value) || 10),
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Devor Qalinligi (m)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder="0 (Yaxlit bino)"
                  className="h-8 text-xs bg-background/50"
                  value={activeObject.wallWidth || ""}
                  onChange={(e) =>
                    setActiveObject({
                      ...activeObject,
                      wallWidth: Math.max(0, parseFloat(e.target.value) || 0),
                    })
                  }
                />
              </div>
            </div>

            {activeObject.type === "box" && (
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Uzunligi (NS - m)</Label>
                  <Input
                    type="number"
                    min={1}
                    className="h-8 text-xs bg-background/50"
                    value={activeObject.length || ""}
                    onChange={(e) =>
                      handleBoxDimensionChange(
                        "length",
                        Math.max(1, Number(e.target.value) || 10)
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Eni (EW - m)</Label>
                  <Input
                    type="number"
                    min={1}
                    className="h-8 text-xs bg-background/50"
                    value={activeObject.width || ""}
                    onChange={(e) =>
                      handleBoxDimensionChange(
                        "width",
                        Math.max(1, Number(e.target.value) || 10)
                      )
                    }
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Obyekt Rangi</Label>
              <div className="flex gap-1.5">
                <Input
                  type="color"
                  className="h-8 w-8 p-0 cursor-pointer border-0 bg-transparent"
                  value={activeObject.color}
                  onChange={(e) =>
                    setActiveObject({ ...activeObject, color: e.target.value })
                  }
                />
                <Input
                  className="h-8 text-xs flex-1 uppercase bg-background/50 font-mono"
                  value={activeObject.color}
                  onChange={(e) =>
                    setActiveObject({ ...activeObject, color: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1.5">
              <Button
                size="sm"
                className="flex-1 bg-green-600 hover:bg-green-500 text-white font-medium border-0"
                onClick={() => {
                  addCustomObject({
                    ...activeObject,
                    id: Date.now().toString(),
                  });
                  setActiveObject(null);
                  toast.success("3D Obyekt muvaffaqiyatli saqlandi");
                }}
              >
                Saqlash
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="flex-1"
                onClick={() => setActiveObject(null)}
              >
                O'chirish
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Saved Custom Objects List */}
      {customObjects.length > 0 && (
        <section className="space-y-2.5 flex-1 min-h-0 flex flex-col">
          <Separator />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Chizilgan Obyektlar ({customObjects.length})</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-5 px-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-transparent"
              onClick={clearCustomObjects}
            >
              Hammasini o'chirish
            </Button>
          </div>
          <div className="overflow-y-auto space-y-1.5 pr-1 flex-1">
            {customObjects.map((obj) => (
              <div
                key={obj.id}
                className="flex items-center justify-between rounded border border-border bg-background/50 p-2 text-[11px]"
              >
                <div className="flex items-center gap-2 truncate">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: obj.color }}
                  />
                  <div className="flex flex-col truncate">
                    <span className="font-medium truncate">{obj.name}</span>
                    <span className="text-[9px] text-muted-foreground">
                      {obj.type === "box" ? "To'rtburchak" : "Ko'pburchak"}
                      {" · "} Balandlik: {obj.height}m
                      {obj.wallWidth ? ` · Devor: ${obj.wallWidth}m` : " · Yaxlit"}
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400 hover:bg-transparent"
                  onClick={() => removeCustomObject(obj.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}
