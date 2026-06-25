# -*- coding: utf-8 -*-
import os
import webbrowser
import json
from PyQt5.QtCore import Qt, QTimer
from PyQt5.QtGui import QIcon
from PyQt5.QtWidgets import QAction, QMessageBox, QApplication
from qgis.core import QgsApplication

from .server_manager import ServerManager, APP_URL
from .flood_dialog import FloodDialog

class Flood3DSim:
    def __init__(self, iface):
        self.iface = iface
        self.plugin_dir = os.path.dirname(__file__)
        self.action_run = None
        self.action_export = None
        self.menu = '&Flooding 3D Simulation'
        self.server = ServerManager()

    def initGui(self):
        icon_path = os.path.join(self.plugin_dir, 'toolbar_icon.jpg')
        icon = QIcon(icon_path)
        
        # 1. Main Action (Start Server & Open Browser)
        self.action_run = QAction(icon, 'Start Simulation (Browser)', self.iface.mainWindow())
        self.action_run.triggered.connect(self.run_simulation)
        
        # 2. Export Layer Action
        self.action_export = QAction(icon, 'Export Active Layer to GeoJSON', self.iface.mainWindow())
        self.action_export.triggered.connect(self.export_layer)

        # Add to Menu and Toolbar
        self.iface.addPluginToMenu(self.menu, self.action_run)
        self.iface.addPluginToMenu(self.menu, self.action_export)
        self.iface.addToolBarIcon(self.action_run)

    def unload(self):
        self.iface.removePluginMenu(self.menu, self.action_run)
        self.iface.removePluginMenu(self.menu, self.action_export)
        self.iface.removeToolBarIcon(self.action_run)
        self.server.stop()

    def run_simulation(self):
        """Oyna ochish va tanlovlarni amalga oshirish"""
        dlg = FloodDialog(self.iface, self.iface.mainWindow())
        if dlg.exec_():
            # Agar OK bosilgan bo'lsa (Boshlash), brauzerni ochamiz
            if self.server.is_running():
                webbrowser.open(APP_URL)
                self.iface.messageBar().pushMessage("Flooding 3D", "Brauzerda ochilmoqda...", level=0, duration=3)
            else:
                self.iface.messageBar().pushMessage("Flooding 3D", "Server ishga tushirilmoqda. Iltimos kuting...", level=0, duration=3)
                ok, msg = self.server.start()
                if ok:
                    QTimer.singleShot(5000, self._open_browser_when_ready)
                else:
                    self.iface.messageBar().pushMessage("Xatolik", msg, level=2, duration=5)

    def _open_browser_when_ready(self):
        if self.server.is_running():
            webbrowser.open(APP_URL)
        else:
            QTimer.singleShot(3000, lambda: webbrowser.open(APP_URL))

    def export_layer(self):
        """Polygon layerini GeoJSON sifatida nusxalaydi"""
        layer = self.iface.activeLayer()
        if not layer:
            QMessageBox.warning(self.iface.mainWindow(), "Xatolik", "QGIS da polygon layerni tanlang.")
            return

        try:
            from qgis.core import (
                QgsVectorLayer, QgsWkbTypes,
                QgsCoordinateReferenceSystem, QgsCoordinateTransform,
                QgsProject, QgsJsonExporter,
            )
            
            if not isinstance(layer, QgsVectorLayer) or layer.geometryType() != QgsWkbTypes.PolygonGeometry:
                QMessageBox.warning(self.iface.mainWindow(), "Xatolik", "Faqat Polygon layerni tanlang.")
                return

            exporter = QgsJsonExporter(layer)
            exporter.setTransformGeometries(True)
            wgs84 = QgsCoordinateReferenceSystem("EPSG:4326")
            transform = QgsCoordinateTransform(layer.crs(), wgs84, QgsProject.instance())
            exporter.setTransform(transform)

            geojson = json.loads(exporter.exportFeatures(layer.getFeatures()))
            if not geojson.get("features"):
                QMessageBox.warning(self.iface.mainWindow(), "Bo'sh", "Layerda obyekt yo'q.")
                return

            feature = geojson["features"][0]
            QApplication.clipboard().setText(json.dumps(feature, ensure_ascii=False, indent=2))
            
            self.iface.messageBar().pushMessage("Muvaffaqiyatli", f"'{layer.name()}' GeoJSON formatida nusxalandi! Endi veb ilovaga Ctrl+V qiling.", level=0, duration=5)

        except Exception as exc:
            QMessageBox.critical(self.iface.mainWindow(), "Eksport xatosi", str(exc))
