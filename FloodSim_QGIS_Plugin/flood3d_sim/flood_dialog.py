# -*- coding: utf-8 -*-
import os
import json
import shutil
from PyQt5.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QComboBox, QRadioButton, 
    QPushButton, QGroupBox, QMessageBox, QApplication
)
from PyQt5.QtCore import Qt
from qgis.core import (
    QgsProject, QgsVectorLayer, QgsWkbTypes, QgsJsonExporter, 
    QgsCoordinateReferenceSystem, QgsCoordinateTransform
)

from .ms_buildings_extractor import extract_buildings_qgis_task

class FloodDialog(QDialog):
    def __init__(self, iface, parent=None):
        super(FloodDialog, self).__init__(parent)
        self.iface = iface
        self.plugin_dir = os.path.dirname(__file__)
        self.setWindowTitle("Flooding 3D Simulation")
        self.resize(400, 300)
        self.setup_ui()
        self.populate_layers()

    def setup_ui(self):
        layout = QVBoxLayout(self)

        # 1. AOI (Hudud chegarasi)
        aoi_group = QGroupBox("1. Simulyatsiya qilinadigan hudud (AOI - Poligon)")
        aoi_layout = QVBoxLayout()
        self.aoi_combo = QComboBox()
        aoi_layout.addWidget(QLabel("Poligon qatlamini tanlang:"))
        aoi_layout.addWidget(self.aoi_combo)
        aoi_group.setLayout(aoi_layout)
        layout.addWidget(aoi_group)

        # 2. Binolar manbai
        bldg_group = QGroupBox("2. Bino va inshootlar manbai")
        bldg_layout = QVBoxLayout()
        
        self.rb_none = QRadioButton("Binolarsiz (faqat relef)")
        self.rb_none.setChecked(True)
        
        self.rb_ms = QRadioButton("Microsoft Building (Avto yuklash)")
        
        self.rb_layer = QRadioButton("Mavjud QGIS qatlami")
        
        self.bldg_combo = QComboBox()
        self.bldg_combo.setEnabled(False)

        self.rb_layer.toggled.connect(lambda: self.bldg_combo.setEnabled(self.rb_layer.isChecked()))

        bldg_layout.addWidget(self.rb_none)
        bldg_layout.addWidget(self.rb_ms)
        bldg_layout.addWidget(self.rb_layer)
        bldg_layout.addWidget(self.bldg_combo)
        bldg_group.setLayout(bldg_layout)
        layout.addWidget(bldg_group)

        # 3. Tugmalar
        btn_layout = QHBoxLayout()
        self.btn_start = QPushButton("Boshlash")
        self.btn_start.setStyleSheet("background-color: #0284c7; color: white; font-weight: bold; padding: 6px;")
        self.btn_start.clicked.connect(self.on_start)
        self.btn_cancel = QPushButton("Bekor qilish")
        self.btn_cancel.clicked.connect(self.reject)
        
        btn_layout.addStretch()
        btn_layout.addWidget(self.btn_cancel)
        btn_layout.addWidget(self.btn_start)
        layout.addLayout(btn_layout)

    def populate_layers(self):
        layers = QgsProject.instance().mapLayers().values()
        for layer in layers:
            if isinstance(layer, QgsVectorLayer) and layer.geometryType() == QgsWkbTypes.PolygonGeometry:
                self.aoi_combo.addItem(layer.name(), layer.id())
                self.bldg_combo.addItem(layer.name(), layer.id())

    def get_layer_geojson(self, layer):
        exporter = QgsJsonExporter(layer)
        exporter.setTransformGeometries(True)
        wgs84 = QgsCoordinateReferenceSystem("EPSG:4326")
        transform = QgsCoordinateTransform(layer.crs(), wgs84, QgsProject.instance())
        exporter.setTransform(transform)
        return json.loads(exporter.exportFeatures(layer.getFeatures()))

    def on_start(self):
        aoi_layer_id = self.aoi_combo.currentData()
        if not aoi_layer_id:
            QMessageBox.warning(self, "Xatolik", "Iltimos hudud chegarasini tanlang!")
            return

        aoi_layer = QgsProject.instance().mapLayer(aoi_layer_id)
        
        # O'zgarishlar veb-ilovaga borishi uchun react_app/public ga saqlaymiz
        react_public_dir = os.path.abspath(os.path.join(self.plugin_dir, '../../files (1)/terrain-flood-sim/remix-of-remix-of-remix-of-remix-of-remix-of-terrain-flood-sim-main/public'))
        
        # 1. Export AOI to boundary.geojson
        try:
            aoi_geojson = self.get_layer_geojson(aoi_layer)
            if not aoi_geojson.get("features"):
                QMessageBox.warning(self, "Xatolik", "Tanlangan AOI qatlami bo'sh!")
                return
            
            boundary_path = os.path.join(react_public_dir, 'boundary.geojson')
            # Extract just the first feature as boundary
            boundary_feat = aoi_geojson["features"][0]
            with open(boundary_path, 'w', encoding='utf-8') as f:
                json.dump(boundary_feat, f)
        except Exception as e:
            QMessageBox.critical(self, "Xato", f"Chegarani eksport qilishda xato:\n{e}")
            return

        # 2. Handle Buildings
        buildings_path = os.path.join(react_public_dir, 'buildings.geojson')
        
        if self.rb_none.isChecked():
            # Clear existing buildings if any
            if os.path.exists(buildings_path):
                os.remove(buildings_path)
                
        elif self.rb_layer.isChecked():
            b_layer_id = self.bldg_combo.currentData()
            if not b_layer_id:
                QMessageBox.warning(self, "Xatolik", "Bino qatlamini tanlang!")
                return
            b_layer = QgsProject.instance().mapLayer(b_layer_id)
            try:
                b_geojson = self.get_layer_geojson(b_layer)
                # Standartize format for frontend: it expects properties to have height_m and type="polygon"
                for feat in b_geojson.get("features", []):
                    props = feat.get("properties", {})
                    # agar qolda chizilgan bo'lsa height yoki height_m bolishi mumkin
                    h = props.get("height_m") or props.get("height") or props.get("Balandlik") or 4.0
                    props["height_m"] = float(h)
                    props["type"] = "polygon"
                    feat["properties"] = props
                    
                with open(buildings_path, 'w', encoding='utf-8') as f:
                    json.dump(b_geojson, f)
            except Exception as e:
                QMessageBox.critical(self, "Xato", f"Binolarni eksport qilishda xato:\n{e}")
                return
                
        elif self.rb_ms.isChecked():
            self.iface.messageBar().pushMessage("Kuting", "Microsoft'dan binolar olinmoqda...", level=0, duration=3)
            QApplication.processEvents()
            
            try:
                # Extract using python script
                # we pass the single boundary feature geojson
                bldg_count = extract_buildings_qgis_task(boundary_feat, out_path=buildings_path, default_height=4.0)
                
                if bldg_count > 0:
                    # QGIS ga qatlam sifatida qo'shish
                    vlayer = QgsVectorLayer(buildings_path, "Microsoft Binolari", "ogr")
                    if vlayer.isValid():
                        QgsProject.instance().addMapLayer(vlayer)
                        self.iface.messageBar().pushMessage("Muvaffaqiyatli", f"{bldg_count} ta bino tushirildi va xaritaga qo'shildi.", level=0, duration=5)
                else:
                    self.iface.messageBar().pushMessage("Ogohlantirish", "Bu hududda Microsoft bazasida binolar topilmadi.", level=1, duration=5)
                    if os.path.exists(buildings_path):
                        os.remove(buildings_path)
            except Exception as e:
                QMessageBox.critical(self, "Xato", f"Microsoft'dan olishda xatolik:\n{e}")
                return

        self.accept()
