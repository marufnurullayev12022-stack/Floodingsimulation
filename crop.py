import sys
try:
    from PyQt5.QtGui import QImage
    from PyQt5.QtWidgets import QApplication

    app = QApplication(sys.argv)
    
    img_path = r'C:\Users\user\.gemini\antigravity-ide\brain\3fb6f636-22bd-4cbe-84cd-d3b374a37090\media__1782286792517.png'
    img = QImage(img_path)
    
    w, h = img.width(), img.height()
    
    # We want to crop the top graphic part (assuming it is roughly the top 60% of the image and centered)
    size = int(h * 0.6)
    left = (w - size) // 2
    
    cropped = img.copy(left, int(h * 0.05), size, size)
    
    out_toolbar = r'D:\Flooding3Dsimlation\FloodSim_QGIS_Plugin\flood3d_sim\toolbar_icon.png'
    out_icon = r'D:\Flooding3Dsimlation\FloodSim_QGIS_Plugin\flood3d_sim\icon.png'
    
    cropped.save(out_toolbar)
    img.save(out_icon)
    print("Cropped successfully.")
except Exception as e:
    print(f"Error: {e}")
