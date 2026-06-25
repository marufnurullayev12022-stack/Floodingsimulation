# -*- coding: utf-8 -*-
import os
import subprocess
import requests

APP_URL = "http://localhost:8080/?qgis=1"

class ServerManager:
    def __init__(self):
        self.process = None
        self.working_dir = r"D:\Flooding3Dsimlation\files (1)\terrain-flood-sim\remix-of-remix-of-remix-of-remix-of-remix-of-terrain-flood-sim-main"

    def start(self):
        if self.is_running():
            return True, "Server allaqachon ishlamoqda."
        
        try:
            env = os.environ.copy()
            env["PATH"] = r"C:\Users\user\node-portable;" + env.get("PATH", "")
            
            # Ensure public files exist before starting Vite to prevent 404 caching
            public_dir = os.path.join(self.working_dir, "public")
            os.makedirs(public_dir, exist_ok=True)
            for f in ["boundary.geojson", "buildings.geojson"]:
                f_path = os.path.join(public_dir, f)
                if not os.path.exists(f_path):
                    with open(f_path, "w", encoding="utf-8") as file:
                        file.write('{"type": "FeatureCollection", "features": []}')

            # Use shell=True for npm on Windows
            self.process = subprocess.Popen(
                "npm run dev",
                cwd=self.working_dir,
                env=env,
                shell=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            return True, "Server ishga tushirildi."
        except Exception as e:
            return False, f"Xatolik: {e}"

    def stop(self):
        if self.process:
            try:
                subprocess.run(['taskkill', '/F', '/T', '/PID', str(self.process.pid)], capture_output=True)
            except Exception:
                pass
            self.process = None
            return True, "Server to'xtatildi."
        return True, "Server allaqachon to'xtatilgan."

    def is_running(self):
        try:
            # Check if vite dev server is responding
            response = requests.get(APP_URL, timeout=1)
            return response.status_code == 200
        except requests.RequestException:
            return False
