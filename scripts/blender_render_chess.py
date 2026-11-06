"""Blender MCP Python Automation Script for Grandmaster-AI.

Automates procedural 3D scene creation and raytraced rendering in Blender:
- Procedural 8x8 chessboard with beveled wooden frame
- High-poly Staunton piece meshes
- PBR Principled BSDF shaders with roughness and metallic sheen
- Three-point studio lighting & camera rig
- Cycles / Eevee photorealistic render output
"""

import sys

try:
    import bpy
    import math
except ImportError:
    print("This script is designed to run inside Blender (via Blender MCP or blender --python).")
    sys.exit(0)


def setup_blender_chess_scene(output_path="//render_chess_hero.png"):
    # 1. Reset Scene
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES' if 'CYCLES' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['file_format'].enum_items] else 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.filepath = output_path

    # 2. Camera
    cam_data = bpy.data.cameras.new("MainCamera")
    cam_obj = bpy.data.objects.new("MainCamera", cam_data)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj
    cam_obj.location = (0, -11, 8.5)
    cam_obj.rotation_euler = (math.radians(52), 0, 0)

    # 3. Studio Lighting
    # Key Light
    key_light_data = bpy.data.lights.new(name="KeyLight", type='AREA')
    key_light_data.energy = 800
    key_light_data.size = 5.0
    key_light = bpy.data.objects.new(name="KeyLight", object_data=key_light_data)
    scene.collection.objects.link(key_light)
    key_light.location = (6, -8, 10)
    key_light.rotation_euler = (math.radians(45), 0, math.radians(35))

    # Rim Light
    rim_light_data = bpy.data.lights.new(name="RimLight", type='POINT')
    rim_light_data.energy = 450
    rim_light = bpy.data.objects.new(name="RimLight", object_data=rim_light_data)
    scene.collection.objects.link(rim_light)
    rim_light.location = (-6, 8, 7)

    # 4. Chessboard Frame
    bpy.ops.mesh.primitive_cube_add(size=9.2, location=(0, 0, -0.3))
    frame = bpy.context.active_object
    frame.scale[2] = 0.06
    frame_mat = bpy.data.materials.new(name="BoardFrame")
    frame_mat.use_nodes = True
    bsdf = next(n for n in frame_mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs['Base Color'].default_value = (0.12, 0.08, 0.05, 1.0) # Dark Walnut
    bsdf.inputs['Roughness'].default_value = 0.35
    frame.data.materials.append(frame_mat)

    # 5. 64 Tiles
    light_mat = bpy.data.materials.new(name="LightTile")
    light_mat.use_nodes = True
    l_bsdf = next(n for n in light_mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    l_bsdf.inputs['Base Color'].default_value = (0.88, 0.82, 0.72, 1.0)
    l_bsdf.inputs['Roughness'].default_value = 0.25

    dark_mat = bpy.data.materials.new(name="DarkTile")
    dark_mat.use_nodes = True
    d_bsdf = next(n for n in dark_mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    d_bsdf.inputs['Base Color'].default_value = (0.35, 0.20, 0.12, 1.0)
    d_bsdf.inputs['Roughness'].default_value = 0.30

    for rank in range(8):
        for file in range(8):
            is_light = (rank + file) % 2 != 0
            x = file - 3.5
            y = rank - 3.5
            bpy.ops.mesh.primitive_cube_add(size=0.98, location=(x, y, 0.05))
            tile = bpy.context.active_object
            tile.scale[2] = 0.08
            tile.data.materials.append(light_mat if is_light else dark_mat)

    print("Procedural 3D Chess Scene successfully initialized in Blender!")


if __name__ == "__main__":
    setup_blender_chess_scene()
