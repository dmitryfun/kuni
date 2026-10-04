"""Open in Blender's Scripting workspace and Run Script. No add-on is required."""
import bpy
import math
from pathlib import Path

text = getattr(bpy.context.space_data, 'text', None)
script_path = Path(text.filepath if text and text.filepath else __file__).resolve()
asset_path = script_path.parent.parent / 'public' / 'rig' / 'kuniman.glb'
if not asset_path.is_file():
    raise FileNotFoundError('Missing public/rig/kuniman.glb in this project')

if bpy.data.is_dirty and bpy.data.filepath:
    raise RuntimeError('Save your current Blender project before importing Kuni Man')
if script_path.with_name('kuniman.blend').exists():
    raise FileExistsError('kuniman.blend already exists; import into a new folder to keep your edits')
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath=str(asset_path))
scene.frame_start = 0
scene.frame_end = 360
scene.frame_set(0)
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.film_transparent = True
scene.render.resolution_x = 760
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100

armatures = [o for o in scene.objects if o.type == 'ARMATURE']
for obj in armatures:
    obj.show_in_front = True
    obj.data.show_names = True
    obj.data.display_type = 'STICK'
    for bone in obj.data.bones:
        bone.use_deform = True

camera_data = bpy.data.cameras.new('Portrait camera')
camera = bpy.data.objects.new('Portrait camera', camera_data)
scene.collection.objects.link(camera)
camera.location = (0, -4, 0)
camera.rotation_euler = (math.pi / 2, 0, 0)
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 1.02
scene.camera = camera

for image in bpy.data.images:
    if image.source != 'GENERATED':
        image.pack()
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_perspective = 'CAMERA'
            area.spaces.active.shading.type = 'MATERIAL'

if armatures:
    bpy.ops.object.select_all(action='DESELECT')
    armatures[0].select_set(True)
    bpy.context.view_layer.objects.active = armatures[0]

bpy.ops.wm.save_as_mainfile(filepath=str(script_path.with_name('kuniman.blend')))
print('Kuni Man: imported rig, packed textures, camera, timeline and saved kuniman.blend')
