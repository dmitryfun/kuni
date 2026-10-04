"""Run from a saved kuniman.blend after editing. Produces kuniman-export.glb."""
import bpy
from pathlib import Path

if not bpy.data.filepath:
    raise RuntimeError('Save the Blender project before exporting')
destination = Path(bpy.data.filepath).with_name('kuniman-export.glb')
# Export options differ slightly between Blender releases; pass only supported keys.
rna_properties = bpy.ops.export_scene.gltf.get_rna_type().properties
properties = {p.identifier for p in rna_properties}
mode_property = rna_properties.get('export_animation_mode')
modes = {item.identifier for item in mode_property.enum_items} if mode_property else set()
options = {
    'filepath': str(destination), 'export_format': 'GLB', 'use_selection': False,
    'export_animations': True, 'export_skins': True, 'export_force_sampling': True,
    'export_frame_range': True, 'export_frame_step': 1,
    'export_cameras': False, 'export_lights': False,
    'export_animation_mode': 'SCENE' if 'SCENE' in modes else 'NLA_TRACKS' if 'NLA_TRACKS' in modes else 'ACTIONS',
    'export_nla_strips': True, 'export_anim_scene_split_object': False,
    'export_anim_scene_name': 'Kuni_Idle',
}
bpy.ops.export_scene.gltf(**{k:v for k,v in options.items() if k in properties})
print('Exported:', destination)
