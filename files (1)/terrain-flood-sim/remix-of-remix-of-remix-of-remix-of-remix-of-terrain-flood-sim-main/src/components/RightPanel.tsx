import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Building2, Shapes, Minus, X, Trash2, Loader2, Download, Upload, Check } from "lucide-react";
import { toast } from "sonner";
import { useRef } from "react";

export function RightPanel() {
  const {
    drawMode,
    setDrawMode,
    drawPoints,
    activeObject,
    setActiveObject,
    customObjects,
    addCustomObject,
    removeCustomObject,
    clearCustomObjects,
  } = useAppStore();

  const importRef = useRef<HTMLInputElement>(null);

  const exportObjects = () => {
    if (customObjects.length === 0) {
      toast.error("Saqlash uchun birorta ham obyekt yo'q");
      return;
    }
    const json = JSON.stringify(customObjects, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `3d-objects-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast.success(`${customObjects.length} ta obyekt JSON faylga saqlandi!`);
  };

  const importObjects = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!Array.isArray(data)) throw new Error("Noto'g'ri format");
        data.forEach((obj: any) => {
          addCustomObject({ ...obj, id: Date.now().toString() + Math.random() });
        });
        toast.success(`${data.length} ta obyekt muvaffaqiyatli yuklandi!`);
      } catch {
        toast.error("JSON faylni o'qishda xatolik");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleSave = () => {
    if (!activeObject) return;
    if (!activeObject.name.trim()) {
      toast.error("Nom kiriting!");
      return;
    }
    addCustomObject({ ...activeObject, id: Date.now().toString() });
    setActiveObject(null);
    toast.success(
      activeObject.type === "line"
        ? `✅ Devor saqlandi (h: ${activeObject.height}m, eni: ${activeObject.wallWidth}m)`
        : `✅ Bino saqlandi (balandlik: ${activeObject.height}m)`
    );
  };

  return (
    <>
      {/* ===== MODAL: chizib bo'lingandan keyin ochiladi ===== */}
      {activeObject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[360px] rounded-2xl border border-cyan-500/30 bg-[#0f172a] shadow-2xl p-5 space-y-4">

            {/* Sarlavha */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-cyan-400 flex items-center gap-2">
                {activeObject.type === "line"
                  ? <Minus className="h-4 w-4" />
                  : <Building2 className="h-4 w-4" />}
                {activeObject.type === "line" ? "Devor Sozlamalari" : "Bino Sozlamalari"}
              </h3>
              <button onClick={() => setActiveObject(null)} className="text-muted-foreground hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <Separator />

            {/* Nom */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                {activeObject.type === "line" ? "Devor nomi" : "Bino nomi"}
              </Label>
              <Input
                className="h-9 text-sm bg-background/60"
                value={activeObject.name}
                onChange={(e) => setActiveObject({ ...activeObject, name: e.target.value })}
              />
            </div>

            {/* Balandlik */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                Balandligi (metr)
              </Label>
              <Input
                type="number"
                min={0.5}
                step={0.5}
                className="h-9 text-sm bg-background/60"
                value={activeObject.height}
                onChange={(e) =>
                  setActiveObject({ ...activeObject, height: Math.max(0.5, parseFloat(e.target.value) || 1) })
                }
              />
            </div>

            {/* Faqat LINE uchun: eni */}
            {activeObject.type === "line" && (
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  Devor eni / qalinligi (metr)
                </Label>
                <Input
                  type="number"
                  min={0.1}
                  step={0.1}
                  className="h-9 text-sm bg-background/60"
                  value={activeObject.wallWidth ?? 0.5}
                  onChange={(e) =>
                    setActiveObject({ ...activeObject, wallWidth: Math.max(0.1, parseFloat(e.target.value) || 0.5) })
                  }
                />
              </div>
            )}

            {/* Rang */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Rangi</Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  className="h-9 w-14 rounded cursor-pointer border border-border bg-transparent p-0.5"
                  value={activeObject.color}
                  onChange={(e) => setActiveObject({ ...activeObject, color: e.target.value })}
                />
                <Input
                  className="h-9 text-sm flex-1 uppercase bg-background/60 font-mono"
                  value={activeObject.color}
                  onChange={(e) => setActiveObject({ ...activeObject, color: e.target.value })}
                />
              </div>
            </div>

            {/* Tugmalar */}
            <div className="flex gap-3 pt-1">
              <Button
                className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold border-0"
                onClick={handleSave}
              >
                <Check className="mr-2 h-4 w-4" />
                Saqlash
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => setActiveObject(null)}>
                Bekor qilish
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== RIGHT PANEL ===== */}
      <aside className="pointer-events-auto absolute right-4 top-4 z-10 flex max-h-[calc(100vh-2rem)] w-[290px] flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-card/90 p-4 shadow-2xl backdrop-blur-xl">
        <header>
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-cyan-400">
            <Building2 className="h-4 w-4" />
            3D Obyektlar Tuzuvchi
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Bino yoki devor chizing
          </p>
        </header>

        <Separator />

        {/* Chizish tugmalari */}
        {drawMode === "none" && (
          <div className="grid grid-cols-1 gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-9 text-xs font-medium border-cyan-500/20 hover:border-cyan-500/50 hover:bg-cyan-500/5"
              onClick={() => setDrawMode("polygon")}
            >
              <Shapes className="mr-1.5 h-3.5 w-3.5 text-cyan-400" />
              3D bino chizish (polygon)
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 text-xs font-medium border-slate-500/20 hover:border-slate-400/50 hover:bg-slate-500/5"
              onClick={() => setDrawMode("line")}
            >
              <Minus className="mr-1.5 h-3.5 w-3.5 text-slate-400" />
              Devor chizish (line)
            </Button>
          </div>
        )}

        {/* Chizilmoqda holati */}
        {drawMode !== "none" && (
          <div className="rounded-md bg-yellow-500/10 border border-yellow-500/30 p-3 text-xs space-y-2">
            <div className="text-yellow-400 flex items-center gap-1.5 font-medium">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>
                {drawMode === "line" ? "Devor" : "Bino"} chizilmoqda... ({drawPoints.length} nuqta)
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {drawMode === "line"
                ? "Chiziq nuqtalarini qo'ying. Tugatish uchun "
                : "Polygon nuqtalarini qo'ying. Tugatish uchun "}
              <strong>ikki marta bosing</strong>.
            </p>
            <Button size="sm" variant="ghost" className="h-7 text-xs w-full" onClick={() => setDrawMode("none")}>
              <X className="mr-1 h-3 w-3" /> Bekor qilish
            </Button>
          </div>
        )}

        {/* Export / Import */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-8 text-xs border-cyan-500/20 hover:border-cyan-500/50"
            onClick={exportObjects}
            disabled={customObjects.length === 0}
          >
            <Download className="mr-1 h-3.5 w-3.5 text-cyan-400" />
            Saqlash
          </Button>
          <label className="flex-1">
            <input ref={importRef} type="file" accept=".json" className="hidden" onChange={importObjects} />
            <Button
              size="sm"
              variant="outline"
              className="w-full h-8 text-xs border-cyan-500/20 hover:border-cyan-500/50"
              onClick={() => importRef.current?.click()}
            >
              <Upload className="mr-1 h-3.5 w-3.5 text-cyan-400" />
              Yuklash
            </Button>
          </label>
        </div>

        {/* Saqlangan obyektlar */}
        {customObjects.length > 0 && (
          <section className="space-y-2 flex-1 min-h-0 flex flex-col">
            <Separator />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Saqlangan ({customObjects.length})</span>
              <button className="text-red-400 hover:text-red-300 transition-colors" onClick={clearCustomObjects}>
                Hammasini o'chirish
              </button>
            </div>
            <div className="overflow-y-auto space-y-1.5 flex-1">
              {customObjects.map((obj) => (
                <div
                  key={obj.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-background/50 px-2.5 py-2 text-[11px]"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span
                      className="h-3 w-3 rounded-sm shrink-0 border border-white/20"
                      style={{ backgroundColor: obj.color }}
                    />
                    <div className="flex flex-col truncate">
                      <span className="font-medium truncate">{obj.name}</span>
                      <span className="text-[9px] text-muted-foreground">
                        {obj.type === "line" ? "Devor" : "Bino"} · {obj.height}m
                        {obj.type === "line" && obj.wallWidth ? ` · Eni: ${obj.wallWidth}m` : ""}
                      </span>
                    </div>
                  </div>
                  <button
                    className="text-muted-foreground hover:text-red-400 transition-colors ml-2 shrink-0"
                    onClick={() => removeCustomObject(obj.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </aside>
    </>
  );
}
