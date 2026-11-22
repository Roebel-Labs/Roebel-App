"""Builds the Elli e-van (stylised Nissan e-NV200) for the Mapbox 3D map.

Clay look: one smooth white shell, a dark glass band, chunky wheels, a front
light strip, red rear lights and Elli's green plug + cable on the flanks.
No textures, no text.

Run headless:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P build_elli.py -- out.glb [preview.png] [out.blend]

Blender axes: +X forward, +Y left, +Z up, metres, origin = ground centre.
The glTF exporter turns that into +X forward, +Y up, -Z left (what the app
expects, model heading offset -90 deg).
"""

import math
import sys

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

# Real e-NV200 Evalia: 4.56 x 1.755 x 1.86 m, wheelbase 2.725 m.
LENGTH = 4.56
BODY_WIDTH = 1.70
HEIGHT = 1.86
CLEARANCE = 0.20
WHEEL_R = 0.33
WHEEL_W = 0.21
TRACK_HALF = 0.74
AXLE_FRONT = 1.33
AXLE_REAR = AXLE_FRONT - 2.725

COLORS = {
    'body': ('#F2F3F5', 0.62, 0.0, None),
    'glass': ('#14181E', 0.5, 0.0, None),
    'trim': ('#2B2F36', 0.7, 0.0, None),
    'tyre': ('#1A1B1E', 0.85, 0.0, None),
    'hub': ('#C8CCD2', 0.45, 0.2, None),
    'light_front': ('#FFFFFF', 0.3, 0.0, ('#FFFFFF', 3.0)),
    'light_rear': ('#E0303F', 0.35, 0.0, ('#B0101E', 1.5)),
    'elli_green': ('#5DBB46', 0.5, 0.0, None),
}


def srgb_to_linear(hex_color):
    n = int(hex_color[1:], 16)
    out = []
    for v in ((n >> 16) & 255, (n >> 8) & 255, n & 255):
        s = v / 255
        out.append(s / 12.92 if s <= 0.04045 else ((s + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def make_materials():
    mats = {}
    for name, (color, rough, metal, emission) in COLORS.items():
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Base Color'].default_value = srgb_to_linear(color)
        bsdf.inputs['Roughness'].default_value = rough
        bsdf.inputs['Metallic'].default_value = metal
        if emission:
            bsdf.inputs['Emission Color'].default_value = srgb_to_linear(emission[0])
            bsdf.inputs['Emission Strength'].default_value = emission[1]
        mats[name] = m
    return mats


def new_object(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def add_material_slots(ob, mats, names):
    for n in names:
        ob.data.materials.append(mats[n])
    return {n: i for i, n in enumerate(names)}


def apply_modifiers(ob):
    bpy.context.view_layer.objects.active = ob
    for mod in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)


# ---------------------------------------------------------------- body shell

# Side-profile stations along X: (x, z_bottom, z_top, half_width)
STATIONS = [
    (-2.31, 0.50, 1.62, 0.66),
    (-2.30, 0.40, 1.74, 0.76),
    (-2.27, 0.33, 1.84, 0.81),
    (-2.05, 0.30, 1.88, 0.85),
    (-1.00, 0.30, 1.88, 0.85),
    (0.10, 0.30, 1.88, 0.85),
    (0.62, 0.30, 1.84, 0.85),
    (0.92, 0.30, 1.58, 0.85),
    (1.22, 0.30, 1.28, 0.85),
    (1.50, 0.30, 1.10, 0.85),
    (1.86, 0.30, 1.02, 0.84),
    (2.14, 0.32, 0.93, 0.80),
    (2.27, 0.38, 0.80, 0.72),
    (2.31, 0.46, 0.66, 0.56),
]
CABIN = (-2.20, 1.40)  # x span with side glass
WINDSCREEN = (0.55, 1.40)  # x span where the top is glass too


def ring(z0, z1, hw):
    """Half ring (left side, bottom centre-ish to roof centre-ish), as (y, z).
    Paired points near each corner are holding loops: they keep the
    subdivided shell crisp instead of blobby."""
    top_hw = hw - 0.08
    belt = min(1.22, z1 - 0.12)
    return [
        (hw - 0.22, z0),  # P0 floor
        (hw - 0.05, z0 + 0.005),  # P1 floor edge (hold)
        (hw, z0 + 0.06),  # P2 sill
        (hw, z0 + 0.34),  # P3 lower door
        (hw - 0.005, belt - 0.02),  # P4 belt (hold)
        (hw - 0.02, belt + 0.02),  # P5 glass starts
        (top_hw, z1 - 0.09),  # P6 glass ends / shoulder
        (top_hw - 0.05, z1 - 0.008),  # P7 roof edge (hold)
        (top_hw - 0.22, z1),  # P8 roof
    ]


# Ring segment k joins ring points k and k+1 (ring = left P0..P8, right P8..P0).
SIDE_GLASS = (5, 11)
WINDSCREEN_SEGS = (6, 7, 8, 9, 10)
FLOOR_SEG = 17


def build_body(mats):
    bm = bmesh.new()
    rings = []
    for x, z0, z1, hw in STATIONS:
        half = ring(z0, z1, hw)
        pts = [(x, y, z) for y, z in half] + [(x, -y, z) for y, z in reversed(half)]
        rings.append([bm.verts.new(p) for p in pts])
    n = len(rings[0])  # 18
    slots_ob_names = ['body', 'glass', 'trim']
    faces = []
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        xm = (STATIONS[i][0] + STATIONS[i + 1][0]) / 2
        for k in range(n):
            f = bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))
            mat = 'body'
            if k in SIDE_GLASS and CABIN[0] <= xm <= CABIN[1]:
                mat = 'glass'
            if k in WINDSCREEN_SEGS and WINDSCREEN[0] <= xm <= WINDSCREEN[1]:
                mat = 'glass'
            if k == FLOOR_SEG:
                mat = 'trim'
            faces.append((f, mat))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = new_object('elli_body', bm)
    idx = add_material_slots(ob, mats, slots_ob_names)
    for poly, (_, mat) in zip(ob.data.polygons, faces):
        poly.material_index = idx[mat]
    sub = ob.modifiers.new('subsurf', 'SUBSURF')
    sub.levels = 2
    sub.render_levels = 2
    apply_modifiers(ob)
    ob.data.shade_smooth()
    fit_to(ob, LENGTH, BODY_WIDTH, HEIGHT - CLEARANCE, CLEARANCE)
    return ob


def fit_to(ob, length, width, height, z_min):
    """Scale + move so the mesh spans exactly the given box (x centred)."""
    vs = [v.co for v in ob.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    s = Vector((length / (hi.x - lo.x), width / (hi.y - lo.y), height / (hi.z - lo.z)))
    for v in ob.data.vertices:
        v.co = Vector((
            (v.co.x - (lo.x + hi.x) / 2) * s.x,
            (v.co.y - (lo.y + hi.y) / 2) * s.y,
            (v.co.z - lo.z) * s.z + z_min,
        ))
    ob.data.update()


# ------------------------------------------------------- decals on the shell

class Surface:
    def __init__(self, ob):
        self.bvh = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())

    def hit(self, origin, direction):
        loc, normal, _, _ = self.bvh.ray_cast(Vector(origin), Vector(direction).normalized())
        if loc is None:
            raise RuntimeError(f'ray from {origin} missed the body')
        return loc, normal


def ribbon(name, surface, mats, mat, origins, direction, width_axis, half_w,
           out=0.007, depth=0.015):
    """Thin solid strip lying on the body surface. `origins` are ray starts
    outside the body; each ray hit becomes one cross-section."""
    axes = width_axis if isinstance(width_axis, list) else [width_axis] * len(origins)
    bm = bmesh.new()
    sections = []
    for o, ax in zip(origins, axes):
        axis = Vector(ax).normalized()
        p, nrm = surface.hit(o, direction)
        # lay the width along the surface so strips don't sink into curves
        w = (axis - nrm * nrm.dot(axis)).normalized()
        sections.append([
            bm.verts.new(p + nrm * out + w * half_w),
            bm.verts.new(p + nrm * out - w * half_w),
            bm.verts.new(p - nrm * depth - w * half_w),
            bm.verts.new(p - nrm * depth + w * half_w),
        ])
    for a, b in zip(sections, sections[1:]):
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    bm.faces.new(sections[0])
    bm.faces.new(list(reversed(sections[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = new_object(name, bm)
    add_material_slots(ob, mats, [mat])
    return ob


def lin(a, b, n):
    return [a + (b - a) * i / (n - 1) for i in range(n)]


def build_decals(body, mats):
    s = Surface(body)
    parts = []
    # dark headlight band across the nose with a glowing strip on it
    parts.append(ribbon('lamp_band', s, mats, 'glass',
                        [(5, y, 0.80) for y in lin(-0.70, 0.70, 29)],
                        (-1, 0, 0), (0, 0, 1), 0.055))
    parts.append(ribbon('light_front', s, mats, 'light_front',
                        [(5, y, 0.80) for y in lin(-0.64, 0.64, 27)],
                        (-1, 0, 0), (0, 0, 1), 0.018, out=0.014))
    # rear lights: vertical bars on both rear corners
    for side in (1, -1):
        parts.append(ribbon(f'light_rear_{side}', s, mats, 'light_rear',
                            [(-5, side * 0.72, z) for z in lin(1.00, 1.48, 8)],
                            (1, 0, 0), (0, 1, 0), 0.035))
    # rear window
    parts.append(ribbon('rear_window', s, mats, 'glass',
                        [(-5, y, 1.45) for y in lin(-0.6, 0.6, 15)],
                        (1, 0, 0), (0, 0, 1), 0.27))
    # dark lower bumpers (front + rear) like the reference's grounded base
    parts.append(ribbon('bumper_front', s, mats, 'trim',
                        [(5, y, 0.42) for y in lin(-0.7, 0.7, 21)],
                        (-1, 0, 0), (0, 0, 1), 0.07))
    parts.append(ribbon('bumper_rear', s, mats, 'trim',
                        [(-5, y, 0.40) for y in lin(-0.72, 0.72, 15)],
                        (1, 0, 0), (0, 0, 1), 0.06))
    for side in (1, -1):
        d = (0, -side, 0)
        # Elli's green plug head on the front corner ...
        parts.append(ribbon(f'plug_{side}', s, mats, 'elli_green',
                            [(x, side * 5, 0.70) for x in lin(1.84, 2.10, 6)],
                            d, (0, 0, 1), 0.10))
        # ... with its prongs pointing forward
        for dz in (0.045, -0.045):
            parts.append(ribbon(f'prong_{side}_{dz}', s, mats, 'trim',
                                [(x, side * 5, 0.70 + dz) for x in lin(2.10, 2.19, 3)],
                                d, (0, 0, 1), 0.014))
        # ... and the cable sweeping back along the flank
        # rises over the front wheel arch, then runs level to the rear
        xs = lin(1.84, -2.00, 48)
        cable = []
        for x in xs:
            t = min(1.0, max(0.0, (1.84 - x) / 0.5))
            cable.append((x, side * 5, 0.70 + 0.16 * t * t * (3 - 2 * t)))
        parts.append(ribbon(f'cable_{side}', s, mats, 'elli_green',
                            cable, d, (0, 0, 1), 0.02))
        # sliding-door seam + handle, subtle panel detail
        parts.append(ribbon(f'seam_{side}', s, mats, 'trim',
                            [(0.30, side * 5, z) for z in lin(0.45, 1.08, 6)],
                            d, (1, 0, 0), 0.006, out=0.003))
        parts.append(ribbon(f'handle_{side}', s, mats, 'trim',
                            [(x, side * 5, 1.00) for x in lin(0.12, 0.24, 3)],
                            d, (0, 0, 1), 0.018))
    # roof rails (the Evalia has them; they also give the top view definition)
    for side in (1, -1):
        parts.append(ribbon(f'rail_{side}', s, mats, 'trim',
                            [(x, side * 0.50, 5) for x in lin(-2.05, 0.40, 12)],
                            (0, 0, -1), (0, 1, 0), 0.028, out=0.03, depth=0.04))
    # dark wheel-arch rims around the top of each wheel
    for ax in (AXLE_FRONT, AXLE_REAR):
        for side in (1, -1):
            angles = lin(math.radians(-5), math.radians(185), 19)
            r = WHEEL_R + 0.07
            pts = [(ax + r * math.cos(a), side * 5, WHEEL_R + r * math.sin(a)) for a in angles]
            radial = [(math.cos(a), 0, math.sin(a)) for a in angles]
            parts.append(ribbon(f'arch_{ax}_{side}', s, mats, 'trim', pts,
                                (0, -side, 0), radial, 0.035, out=0.004))
    return parts


# --------------------------------------------------------- wheels + mirrors

def build_wheel(mats, x, side):
    bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=WHEEL_R, depth=WHEEL_W,
                                        location=(x, side * TRACK_HALF, WHEEL_R),
                                        rotation=(math.pi / 2, 0, 0))
    tyre = bpy.context.active_object
    tyre.name = f'tyre_{x}_{side}'
    bev = tyre.modifiers.new('bevel', 'BEVEL')
    bev.width = 0.05
    bev.segments = 3
    apply_modifiers(tyre)
    tyre.data.materials.append(mats['tyre'])
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=WHEEL_R * 0.58, depth=0.02,
                                        location=(x, side * (TRACK_HALF + WHEEL_W / 2), WHEEL_R),
                                        rotation=(math.pi / 2, 0, 0))
    hub = bpy.context.active_object
    hub.name = f'hub_{x}_{side}'
    hub.data.materials.append(mats['hub'])
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
    return [tyre, hub]


def build_mirror(mats, side):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(1.22, side * 0.86, 1.20))
    m = bpy.context.active_object
    m.name = f'mirror_{side}'
    m.scale = (0.09, 0.10, 0.09)
    bpy.ops.object.transform_apply(scale=True)
    bev = m.modifiers.new('bevel', 'BEVEL')
    bev.width = 0.035
    bev.segments = 3
    apply_modifiers(m)
    m.data.materials.append(mats['trim'])
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
    return m


# ------------------------------------------------------------------ preview

def render_preview(path):
    scene = bpy.context.scene
    for engine in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 900
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('studio')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.82, 0.83, 0.86, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    scene.world = world

    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.name = 'preview_ground'
    gm = bpy.data.materials.new('ground')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.80, 0.81, 0.84, 1)
    gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1.0
    ground.data.materials.append(gm)

    bpy.ops.object.light_add(type='AREA', location=(2, 4, 7))
    key = bpy.context.active_object
    key.data.energy = 1400
    key.data.size = 6
    key.rotation_euler = (math.radians(-30), math.radians(10), 0)
    bpy.ops.object.light_add(type='SUN', location=(0, 0, 10))
    sun = bpy.context.active_object
    sun.data.energy = 1.2
    sun.rotation_euler = (math.radians(35), math.radians(-25), math.radians(30))

    bpy.ops.object.camera_add()
    cam = bpy.context.active_object
    scene.camera = cam
    cam.data.lens = 85
    shots = {
        '': (Vector((9.0, -6.5, 5.2)), Vector((0.1, 0, 0.75))),  # 3/4 front, like Uber
        '-map': (Vector((-5.5, -7.5, 11.5)), Vector((0, 0, 0.6))),  # map pitch view
    }
    for suffix, (loc, target) in shots.items():
        cam.location = loc
        cam.rotation_euler = (target - loc).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = path.replace('.png', f'{suffix}.png')
        bpy.ops.render.render(write_still=True)


# --------------------------------------------------------------------- main

def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise SystemExit('usage: blender -b -P build_elli.py -- out.glb [preview.png] [out.blend]')
    out_glb = argv[0]
    preview = argv[1] if len(argv) > 1 else None
    out_blend = argv[2] if len(argv) > 2 else None

    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = make_materials()
    body = build_body(mats)
    parts = [body] + build_decals(body, mats)
    for x in (AXLE_FRONT, AXLE_REAR):
        for side in (1, -1):
            parts += build_wheel(mats, x, side)
    parts += [build_mirror(mats, 1), build_mirror(mats, -1)]

    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    van = bpy.context.active_object
    van.name = 'elli'
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    if out_blend:
        bpy.ops.wm.save_as_mainfile(filepath=out_blend)

    bpy.ops.object.select_all(action='DESELECT')
    van.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=out_glb,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=False,
        export_normals=True,
        export_materials='EXPORT',
    )

    if preview:
        render_preview(preview)


main()
