# -*- coding: utf-8 -*-
"""
Flood Simulation Panel — minimal server boshqaruvi paneli.
To'g'ridan-to'g'ri brauzerda ochadi. WebEngine ishlatilmaydi.
"""

import json
import webbrowser

from PyQt5.QtCore import Qt, QTimer
from PyQt5.QtWidgets import (
    QDockWidget, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QLabel, QFrame, QSizePolicy,
    QMessageBox, QToolBar,
)

from .server_manager import ServerManager, APP_URL


# ── Stil ──────────────────────────────────────────────────────────────────────
TOOLBAR_STYLE = """
QToolBar {
    background: #1a2744;
    border: none;
    padding: 3px 6px;
    spacing: 4px;
}
"""
BTN_BASE   = "border:none; border-radius:4px; padding:4px 10px; font-size:12px; font-weight:500; color:white;"
BTN_GREEN  = f"QPushButton{{background:#1b7a3e;{BTN_BASE}}}QPushButton:hover{{background:#239050;}}"
BTN_RED    = f"QPushButton{{background:#7a1b1b;{BTN_BASE}}}QPushButton:hover{{background:#962020;}}"
BTN_BLUE   = f"QPushButton{{background:#0ea5e9;{BTN_BASE}}}QPushButton:hover{{background:#38bdf8;}}"
BTN_PURPLE = f"QPushButton{{background:#4a1a7a;{BTN_BASE}}}QPushButton:hover{{background:#5a2096;}}"


class FloodSimPanel(QDockWidget):
    """3D Flood Simulation — server boshqaruvi va brauzer launcher."""

    def __init__(self, iface, parent=None):
        super().__init__("🌊  3D Flood Simulation", parent)
        self.iface  = iface
        self.server = ServerManager()

        self.setMinimumWidth(500)
        self.setMaximumHeight(160)
        self.setAllowedAreas(
            Qt.TopDockWidgetArea | Qt.BottomDockWidgetArea |
            Qt.LeftDockWidgetArea | Qt.RightDockWidgetArea
        )

        self._build_ui()
        self._start_status_timer()
        self._auto_init()

    # ═══════════════════════════════════════════════════════════════════════════
    # UI
    # ═══════════════════════════════════════════════════════════════════════════

    def _build_ui(self):
        root = QWidget()
        root.setStyleSheet("background:#0f172a;")
        vbox = QVBoxLayout(root)
        vbox.setContentsMargins(0, 0, 0, 0)
        vbox.setSpacing(0)

        vbox.addWidget(self._make_toolbar())
        vbox.addWidget(self._make_statusbar())

        self.setWidget(root)

    def _make_toolbar(self):
        tb = QToolBar()
        tb.setMovable(False)
        tb.setStyleSheet(TOOLBAR_STYLE)

        # Logo
        logo = QLabel("🌊  3D Flood Simulation")
        logo.setStyleSheet("color:#4fc3f7; font-weight:bold; font-size:13px; padding:0 12px;")
        tb.addWidget(logo)

        sp = QWidget()
        sp.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Preferred)
        tb.addWidget(sp)

        def btn(text, style, tip, slot):
            b = QPushButton(text)
            b.setStyleSheet(style)
            b.setToolTip(tip)
            b.clicked.connect(slot)
            tb.addWidget(b)
            return b

        self.btn_start  = btn("▶ Start",        BTN_GREEN,  "Dev serverni ishga tushirish", self.start_server)
        self.btn_stop   = btn("■ Stop",          BTN_RED,    "Dev serverni to'xtatish",      self.stop_server)
        self.btn_browser= btn("🔗 Ochish",       BTN_BLUE,   "Brauzerda ochish",             self._open_in_browser)
        self.btn_export = btn("📤 Layer Export", BTN_PURPLE, "Polygon layerni eksport qilish", self._export_layer)

        return tb

    def _make_statusbar(self):
        frame = QFrame()
        frame.setStyleSheet("QFrame{background:#111827; border-top:1px solid #2d3748;}")
        frame.setFixedHeight(28)
        h = QHBoxLayout(frame)
        h.setContentsMargins(10, 0, 10, 0)

        self.lbl_status = QLabel("Tayyor.")
        self.lbl_status.setStyleSheet("color:#9ca3af; font-size:11px;")

        self.lbl_server = QLabel("● tekshirilmoqda...")
        self.lbl_server.setStyleSheet("color:#9ca3af; font-size:11px;")

        h.addWidget(self.lbl_status)
        h.addStretch()
        h.addWidget(self.lbl_server)
        return frame

    # ═══════════════════════════════════════════════════════════════════════════
    # Server
    # ═══════════════════════════════════════════════════════════════════════════

    def _auto_init(self):
        """Avto: server ishlaayaptimi → brauzerda och. Aks holda — ishga tushir."""
        if self.server.is_running():
            self._set_server_status(True)
            self._set_status("✅ Server ishlayapti — brauzerda ochilmoqda...")
            self._open_in_browser()
        else:
            self._set_status("🚀 Server ishga tushirilmoqda...")
            self.start_server()

    def start_server(self):
        self._set_status("🚀 Server ishga tushirilmoqda...")
        ok, msg = self.server.start()
        self._set_status(msg)
        if ok:
            # Server tayyor bo'lishini kutib brauzerda ochamiz
            QTimer.singleShot(5000, self._open_after_start)

    def _open_after_start(self):
        if self.server.is_running():
            self._open_in_browser()
            self._set_status(f"✅ Brauzerda ochildi: {APP_URL}")
            self._set_server_status(True)
        else:
            # Hali tayyor emas — 3 soniya yana kutamiz
            self._set_status("⏳ Server hali tayyor emas, kutilmoqda...")
            QTimer.singleShot(3000, self._open_after_start)

    def stop_server(self):
        _, msg = self.server.stop()
        self._set_status(msg)
        self._set_server_status(False)

    def _open_in_browser(self):
        webbrowser.open(APP_URL)

    # ═══════════════════════════════════════════════════════════════════════════
    # Layer eksport (GeoJSON → temp fayl → brauzer ochilganida clipboard)
    # ═══════════════════════════════════════════════════════════════════════════

    def _export_layer(self):
        layer = self.iface.activeLayer()
        if not layer:
            QMessageBox.warning(self, "Layer yo'q", "QGIS da polygon layerni tanlang.")
            return

        try:
            from qgis.core import (
                QgsVectorLayer, QgsWkbTypes,
                QgsCoordinateReferenceSystem, QgsCoordinateTransform,
                QgsProject, QgsJsonExporter,
            )
        except ImportError:
            QMessageBox.critical(self, "Import xatosi", "qgis.core moduli topilmadi.")
            return

        if not isinstance(layer, QgsVectorLayer):
            QMessageBox.warning(self, "Noto'g'ri tur", "Vector (polygon) layerni tanlang.")
            return

        if layer.geometryType() != QgsWkbTypes.PolygonGeometry:
            QMessageBox.warning(self, "Noto'g'ri geometriya", "Polygon layer tanlang.")
            return

        try:
            exporter = QgsJsonExporter(layer)
            exporter.setTransformGeometries(True)
            wgs84     = QgsCoordinateReferenceSystem("EPSG:4326")
            transform = QgsCoordinateTransform(layer.crs(), wgs84, QgsProject.instance())
            exporter.setTransform(transform)

            geojson = json.loads(exporter.exportFeatures(layer.getFeatures()))
            if not geojson.get("features"):
                QMessageBox.warning(self, "Bo'sh layer", "Layerda obyekt topilmadi.")
                return

            feature = geojson["features"][0]

            # GeoJSON ni clipboard ga ko'chirish
            from PyQt5.QtWidgets import QApplication
            QApplication.clipboard().setText(json.dumps(feature, ensure_ascii=False, indent=2))

            self._set_status(f"✅ '{layer.name()}' GeoJSON clipboard ga ko'chirildi!")
            QMessageBox.information(
                self, "Layer eksport qilindi",
                f"'{layer.name()}' layerining GeoJSON clipboard ga ko'chirildi.\n\n"
                "Simulyatsiya ilovasida:\n"
                "  Area boundary → matn maydoniga Ctrl+V bosing → Load\n\n"
                f"URL: {APP_URL}"
            )

        except Exception as exc:
            QMessageBox.critical(self, "Eksport xatosi", str(exc))

    # ═══════════════════════════════════════════════════════════════════════════
    # Status
    # ═══════════════════════════════════════════════════════════════════════════

    def _start_status_timer(self):
        self._timer = QTimer(self)
        self._timer.timeout.connect(self._poll_server)
        self._timer.start(4000)

    def _poll_server(self):
        self._set_server_status(self.server.is_running())

    def _set_server_status(self, running: bool):
        if running:
            self.lbl_server.setText("● Server: ishlayapti :8080")
            self.lbl_server.setStyleSheet("color:#4ade80; font-size:11px;")
        else:
            self.lbl_server.setText("● Server: to'xtatilgan")
            self.lbl_server.setStyleSheet("color:#f87171; font-size:11px;")

    def _set_status(self, msg: str):
        self.lbl_status.setText(msg)

    def closeEvent(self, event):
        self._timer.stop()
        super().closeEvent(event)
