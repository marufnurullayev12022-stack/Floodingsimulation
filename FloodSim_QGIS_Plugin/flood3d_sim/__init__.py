# -*- coding: utf-8 -*-

def classFactory(iface):
    from .flood3d_sim import Flood3DSim
    return Flood3DSim(iface)
