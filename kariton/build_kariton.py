# build_kariton.py - low-poly Filipino wooden pushcart (kariton) for Roblox Studio.
#
# Run:  blender -b -P build_kariton.py
# Output (same folder): kariton.blend (texture PACKED), kariton.fbx, kariton.glb, kariton_atlas.png, previews/*.png
#
# Conventions (1 Blender unit = 1 stud-sized unit; Z up in Blender):
#   X = width, Y = length (+Y = handle / FRONT, -Y = umbrellas / BACK), Z = up. Origin = centre of the cart base on the ground.
#   Wheels are SEPARATE objects whose origin is the HUB CENTRE and whose axle is the local X axis, so in Roblox
#   (Y-up, same X axis) a HingeConstraint with the default Attachment axis (X) makes them spin.
#   One material + one 1024x1024 UV atlas (colours baked into the image, no procedural nodes).
import bpy, bmesh, math, random, os, sys
import numpy as np
from mathutils import Vector, Matrix, Euler

OUT = os.path.dirname(os.path.abspath(__file__))
PREV = os.path.join(OUT, "previews")
os.makedirs(PREV, exist_ok=True)
random.seed(11)
np.random.seed(11)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ----------------------------------------------------------------------------------------------------------------------
# 1) TEXTURE ATLAS (8x8 grid of 128 px cells; baked colours; no lighting/shadows in the base colour)
# ----------------------------------------------------------------------------------------------------------------------
SIZE, GRID = 1024, 8
CELL_PX = SIZE // GRID

def S(r, g, b):
    return (r / 255.0, g / 255.0, b / 255.0)

CELL_DEFS = [
    # name,          base colour,          pattern,   second colour
    ("wood_light",   S(214, 150, 70),      "wood",    None),
    ("wood_dark",    S(160, 104, 48),      "wood",    None),
    ("wood_weath",   S(190, 138, 66),      "wood",    S(150, 150, 70)),
    ("olive",        S(98, 118, 52),       "wood",    None),
    ("rubber",       S(30, 30, 33),        "flat",    None),
    ("metal",        S(176, 178, 184),     "flat",    None),
    ("metal_dark",   S(110, 112, 118),     "flat",    None),
    ("suitcase",     S(38, 38, 42),        "flat",    None),
    ("red",          S(190, 36, 36),       "flat",    None),
    ("orange",       S(240, 128, 32),      "flat",    None),
    ("white",        S(234, 236, 242),     "flat",    None),
    ("blue",         S(48, 98, 206),       "flat",    None),
    ("checker",      S(48, 98, 206),       "checker", S(236, 238, 246)),
    ("diag",         S(48, 98, 206),       "diag",    S(236, 238, 246)),
    ("star",         S(228, 192, 122),     "sparkle", S(255, 250, 235)),
    ("wire",         S(150, 152, 160),     "flat",    None),
    ("umbrella",     S(46, 34, 30),        "flat",    None),
    ("clear",        S(196, 212, 224),     "flat",    None),
]
CELL_INDEX = {c[0]: i for i, c in enumerate(CELL_DEFS)}

def srgb_to_lin(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def make_cell(base, pattern, c2):
    px = np.zeros((CELL_PX, CELL_PX, 3), dtype=np.float32)
    base = np.array(base, dtype=np.float32)
    noise = (np.random.rand(CELL_PX, CELL_PX, 1).astype(np.float32) - 0.5) * 0.04
    yy, xx = np.mgrid[0:CELL_PX, 0:CELL_PX]
    if pattern == "wood":
        grain = 1.0 + 0.05 * np.sin(yy * 0.55) + 0.035 * np.sin(yy * 1.9 + 1.3) + 0.02 * np.sin(xx * 0.05)
        px[:] = base * grain[..., None]
    elif pattern == "checker":
        sq = ((xx // 32) + (yy // 32)) % 2
        c2a = np.array(c2, dtype=np.float32)
        px[:] = np.where(sq[..., None] == 0, base, c2a)
    elif pattern == "diag":
        sq = (((xx + yy) // 22) % 2)
        c2a = np.array(c2, dtype=np.float32)
        px[:] = np.where(sq[..., None] == 0, base, c2a)
    elif pattern == "sparkle":
        px[:] = base
        c2a = np.array(c2, dtype=np.float32)
        spots = np.random.rand(CELL_PX, CELL_PX) > 0.93
        px[spots] = c2a
    else:
        px[:] = base
    if pattern == "wood" and c2 is not None:  # weathered olive-green tint streaks
        streak = (np.sin(yy * 0.21 + xx * 0.02) > 0.55).astype(np.float32)[..., None]
        px[:] = px * (1 - 0.35 * streak) + np.array(c2, dtype=np.float32) * 0.35 * streak
    px += noise
    return np.clip(px, 0, 1)

atlas = np.zeros((SIZE, SIZE, 4), dtype=np.float32)
atlas[..., 3] = 1.0
for i, (name, base, pattern, c2) in enumerate(CELL_DEFS):
    col, row = i % GRID, i // GRID
    cell = make_cell(base, pattern, c2)
    x0, y0 = col * CELL_PX, row * CELL_PX
    atlas[y0:y0 + CELL_PX, x0:x0 + CELL_PX, :3] = srgb_to_lin(cell)
# unused cells: neutral grey so nothing is left transparent/black
for i in range(len(CELL_DEFS), GRID * GRID):
    col, row = i % GRID, i // GRID
    atlas[row * CELL_PX:(row + 1) * CELL_PX, col * CELL_PX:(col + 1) * CELL_PX, :3] = srgb_to_lin(np.array([0.5, 0.5, 0.5]))

img = bpy.data.images.new("kariton_atlas", SIZE, SIZE, alpha=False, float_buffer=True)
img.colorspace_settings.name = "sRGB"
img.pixels.foreach_set(atlas.ravel())
img.filepath_raw = os.path.join(OUT, "kariton_atlas.png")
img.file_format = "PNG"
img.save()
img.pack()

mat = bpy.data.materials.new("KaritonAtlas")
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes.get("Principled BSDF")
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = img
tex.interpolation = "Linear"
nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.85
bsdf.inputs["Metallic"].default_value = 0.0

INSET = 6.0 / SIZE

def cell_rect(name):
    i = CELL_INDEX[name]
    col, row = i % GRID, i // GRID
    return (col / GRID + INSET, row / GRID + INSET, (col + 1) / GRID - INSET, (row + 1) / GRID - INSET)

# ----------------------------------------------------------------------------------------------------------------------
# 2) GEOMETRY BUILDER (primitives -> one bmesh per output mesh; per-primitive box-projected UVs into an atlas cell)
# ----------------------------------------------------------------------------------------------------------------------
class Builder:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")

    def _finish(self, verts, cell, flat=False, rot=None, pos=(0, 0, 0), scale=(1, 1, 1)):
        faces = list({f for v in verts for f in v.link_faces})
        bmesh.ops.recalc_face_normals(self.bm, faces=faces)
        co = [v.co.copy() for v in verts]
        mn = Vector((min(c.x for c in co), min(c.y for c in co), min(c.z for c in co)))
        mx = Vector((max(c.x for c in co), max(c.y for c in co), max(c.z for c in co)))
        size = mx - mn
        for i in range(3):
            if size[i] < 1e-6:
                size[i] = 1.0
        u0, v0, u1, v1 = cell_rect(cell)
        cu, cv = (u0 + u1) / 2, (v0 + v1) / 2
        for f in faces:
            n = f.normal
            ax = max(range(3), key=lambda k: abs(n[k]))
            a, b = [(1, 2), (0, 2), (0, 1)][ax]
            for l in f.loops:
                p = l.vert.co
                if flat:
                    l[self.uv].uv = (cu, cv)
                else:
                    s = (p[a] - mn[a]) / size[a]
                    t = (p[b] - mn[b]) / size[b]
                    l[self.uv].uv = (u0 + s * (u1 - u0), v0 + t * (v1 - v0))
        if rot is None:
            rot = Euler((0, 0, 0))
        M = Matrix.LocRotScale(Vector(pos), rot, Vector(scale))
        bmesh.ops.transform(self.bm, matrix=M, verts=verts)

    def box(self, pos, size, cell, rot=None, flat=False):
        r = bmesh.ops.create_cube(self.bm, size=1.0)
        self._finish(r["verts"], cell, flat, rot, pos, size)

    def box_between(self, p0, p1, thick, cell, flat=False):
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        rot = Vector((0, 0, 1)).rotation_difference(d.normalized())
        self.box((p0 + p1) / 2, (thick, thick, d.length), cell, rot, flat)

    def cyl(self, pos, radius, depth, cell, axis="Z", segs=12, radius2=None, flat=False, rot_extra=None):
        r = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segs,
                                  radius1=radius, radius2=(radius if radius2 is None else radius2), depth=depth,
                                  calc_uvs=False)
        rot = {"Z": Euler((0, 0, 0)), "X": Euler((0, math.pi / 2, 0)), "Y": Euler((math.pi / 2, 0, 0))}[axis]
        if rot_extra is not None:
            rot = (rot_extra.to_quaternion() @ rot.to_quaternion())
        self._finish(r["verts"], cell, flat, rot, pos)

    def blob(self, pos, scale, cell, rot=None, jitter=0.06, subdiv=2):
        # soft lumpy bundle / sack: low-poly icosphere, jittered, smooth-shaded
        r = bmesh.ops.create_icosphere(self.bm, subdivisions=subdiv, radius=1.0, calc_uvs=False)
        for v in r["verts"]:
            v.co += Vector((random.uniform(-jitter, jitter), random.uniform(-jitter, jitter), random.uniform(-jitter, jitter)))
        for f in {f for v in r["verts"] for f in v.link_faces}:
            f.smooth = True
        self._finish(r["verts"], cell, False, rot, pos, scale)

    def torus(self, pos, major, minor, cell, rot=None, nmaj=10, nmin=4):
        verts = []
        for i in range(nmaj):
            a = 2 * math.pi * i / nmaj
            for j in range(nmin):
                b = 2 * math.pi * j / nmin
                rr = major + minor * math.cos(b)
                verts.append(self.bm.verts.new((rr * math.cos(a), rr * math.sin(a), minor * math.sin(b))))
        for i in range(nmaj):
            for j in range(nmin):
                v00 = verts[i * nmin + j]
                v01 = verts[i * nmin + (j + 1) % nmin]
                v10 = verts[((i + 1) % nmaj) * nmin + j]
                v11 = verts[((i + 1) % nmaj) * nmin + (j + 1) % nmin]
                self.bm.faces.new((v00, v10, v11, v01))
        self._finish(verts, cell, False, rot, pos)

    def star(self, pos, radius, thick, cell, rot=None):
        pts = []
        for k in range(10):
            ang = math.pi / 2 + k * math.pi / 5
            rr = radius if k % 2 == 0 else radius * 0.45
            pts.append((rr * math.cos(ang), rr * math.sin(ang)))
        front = [self.bm.verts.new((x, -thick / 2, z)) for x, z in pts]
        back = [self.bm.verts.new((x, thick / 2, z)) for x, z in pts]
        self.bm.faces.new(front)
        self.bm.faces.new(list(reversed(back)))
        for k in range(10):
            k2 = (k + 1) % 10
            self.bm.faces.new((front[k], back[k], back[k2], front[k2]))
        self._finish(front + back, cell, False, rot, pos)

    def to_object(self, location=(0, 0, 0)):
        faces = list(self.bm.faces)
        bmesh.ops.recalc_face_normals(self.bm, faces=faces)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        tris = sum(len(p.vertices) - 2 for p in mesh.polygons)
        self.bm.free()
        mesh.materials.append(mat)
        obj = bpy.data.objects.new(self.name, mesh)
        obj.location = location
        scene.collection.objects.link(obj)
        return obj, tris

def E(x=0, y=0, z=0):
    return Euler((math.radians(x), math.radians(y), math.radians(z)))

# ----------------------------------------------------------------------------------------------------------------------
# 3) CART BODY
# ----------------------------------------------------------------------------------------------------------------------
R_WHEEL = 1.55
WHEEL_X = 2.55
WHEEL_Y = 1.0
body = Builder("Kariton_Body")

# deck slats (flat platform with visible slats)
for i in range(8):
    y = -4.2 + 0.525 + i * 1.05
    body.box((0, y, 1.9), (3.7, 0.95, 0.22), "wood_light" if i % 2 == 0 else "wood_weath")
# under-frame
for sx in (-1, 1):
    body.box((sx * 1.45, 0, 1.54), (0.35, 8.7, 0.5), "wood_dark")
for y in (-3.7, -1.3, 1.3, 3.7):
    body.box((0, y, 1.5), (3.8, 0.45, 0.4), "wood_dark")
# axle (the wheels spin around it)
body.cyl((0, WHEEL_Y, R_WHEEL), 0.14, 5.4, "metal_dark", axis="X", segs=8)
# axle brackets under the deck
for sx in (-1, 1):
    body.box((sx * 1.7, WHEEL_Y, 1.68), (0.3, 0.5, 0.3), "metal_dark")

# side walls: posts + 2 olive rails + thin slats
for sx in (-1, 1):
    for y in (-4.0, -2.0, 0.0, 2.0, 4.0):
        body.box((sx * 1.9, y, 2.9), (0.3, 0.3, 1.8), "wood_light")
    for y in (-3.0, -1.0, 1.0, 3.0):
        body.box((sx * 1.9, y, 2.85), (0.14, 0.22, 1.7), "wood_dark")
    body.box((sx * 2.07, 0, 3.45), (0.2, 8.5, 0.38), "olive")
    body.box((sx * 2.07, 0, 2.55), (0.2, 8.5, 0.38), "olive")
# rear panel (y = -4.2)
for x in (-1.9, -0.95, 0.0, 0.95, 1.9):
    body.box((x, -4.2, 2.9), (0.3, 0.3, 1.8), "wood_light")
body.box((0, -4.37, 3.45), (3.9, 0.2, 0.38), "olive")
body.box((0, -4.37, 2.55), (3.9, 0.2, 0.38), "olive")
# front board
body.box((0, 4.3, 2.4), (3.9, 0.22, 0.9), "wood_weath")

# handle: two sturdy arms + a horizontal cylindrical grip, braced to the frame
GRIP = (0, 8.05, 3.75)
for sx in (-1, 1):
    body.box_between((sx * 1.5, 4.2, 2.15), (sx * 1.4, GRIP[1], GRIP[2]), 0.3, "wood_light")
    body.box_between((sx * 1.5, 4.2, 1.5), (sx * 1.45, 6.3, 3.0), 0.22, "wood_light")
    body.box((sx * 1.5, 4.3, 2.15), (0.5, 0.4, 0.55), "metal_dark")  # bracket where the arm is bolted to the frame
body.cyl(GRIP, 0.24, 3.5, "wood_light", axis="X", segs=10)
for sx in (-1, 1):
    body.cyl((sx * 1.78, GRIP[1], GRIP[2]), 0.3, 0.12, "wood_dark", axis="X", segs=10)
# cross brace between the arms
body.box((0, 5.6, 2.9), (2.7, 0.25, 0.25), "wood_dark")

# caster brackets (the caster WHEELS are separate objects)
CASTER_Y, CASTER_X, CASTER_R = -3.4, 1.3, 0.42
for sx in (-1, 1):
    body.box((sx * CASTER_X, CASTER_Y, 1.27), (0.6, 0.6, 0.1), "metal_dark")
    body.box((sx * CASTER_X, CASTER_Y, 1.0), (0.18, 0.18, 0.45), "metal_dark")
    for dx in (-0.2, 0.2):
        body.box((sx * CASTER_X + dx, CASTER_Y, 0.62), (0.07, 0.4, 0.75), "metal")

# lower shelf (front) with sack + small orange box
body.box((0, 2.9, 0.65), (3.3, 2.6, 0.12), "wood_weath")
for sx in (-1, 1):
    body.box((sx * 1.5, 2.9, 0.98), (0.12, 2.4, 0.7), "wood_dark")
body.blob((0.3, 2.9, 1.0), (0.85, 0.75, 0.6), "white", E(0, 0, 20))
body.cyl((0.3, 2.9, 1.45), 0.12, 0.3, "white", segs=6, radius2=0.04)
body.box((-1.0, 2.5, 0.95), (0.9, 0.8, 0.55), "orange", E(0, 0, 12))

# ---------------- loads inside the bed ----------------
body.box((-0.9, 1.9, 2.42), (1.5, 1.2, 0.8), "orange")
body.box((-0.9, 1.9, 2.86), (1.56, 1.26, 0.1), "orange")
body.box((1.15, -1.7, 2.37), (1.3, 1.0, 0.7), "orange", E(0, 0, 10))
body.cyl((1.2, 3.0, 2.37), 0.45, 0.74, "orange", segs=10, radius2=0.52)
body.box((-1.0, -3.0, 2.47), (1.5, 1.1, 0.9), "clear")
body.box((-1.0, -3.0, 2.97), (1.56, 1.16, 0.1), "white")
for p, sc, rz in (((-0.2, -0.2, 2.62), (0.85, 0.75, 0.62), 15), ((0.95, 0.9, 2.66), (0.8, 0.7, 0.66), 40), ((-1.05, 0.2, 2.7), (0.8, 0.72, 0.66), -25)):
    body.blob(p, sc, "white", E(0, 0, rz))

# rear sack pile (white / diag blue-white / blue), with ties
pile = [((-1.0, -3.0, 3.8), (1.05, 0.95, 0.78), "white", 10),
        ((0.9, -3.2, 3.75), (1.05, 0.95, 0.8), "diag", -20),
        ((0.0, -2.2, 4.2), (1.1, 1.0, 0.8), "blue", 35),
        ((-1.0, -1.5, 3.8), (1.0, 0.95, 0.75), "checker", 5),
        ((1.0, -1.3, 3.7), (0.95, 0.9, 0.72), "white", -35),
        ((0.1, -3.4, 4.7), (1.15, 1.0, 0.85), "white", 0),
        ((-0.3, -0.2, 3.9), (1.0, 0.9, 0.7), "diag", 20),
        ((1.2, -2.4, 4.35), (0.85, 0.8, 0.65), "checker", -10),
        ((-1.2, -2.6, 4.45), (0.85, 0.8, 0.65), "blue", 15)]
for p, sc, cell, rz in pile:
    body.blob(p, sc, cell, E(random.uniform(-6, 6), random.uniform(-6, 6), rz))
    body.cyl((p[0], p[1], p[2] + sc[2] * 0.95), 0.13, 0.32, cell if cell == "white" else "white", segs=6, radius2=0.04)

# folded / draped tarpaulins
body.box((0, 1.4, 3.52), (3.75, 4.3, 0.18), "blue", E(0, 1.5, 0))
body.box((0.05, -0.7, 3.62), (3.4, 2.1, 0.28), "checker", E(0, -2, 4))
body.box((-0.1, -0.5, 3.88), (3.0, 1.8, 0.26), "diag", E(1, 2, -6))
body.box((0.3, 0.4, 3.78), (2.6, 1.3, 0.22), "white", E(0, 3, 10))
body.box((-1.1, 3.4, 3.62), (1.3, 1.2, 0.3), "diag", E(0, 0, 25))
body.blob((1.0, 3.55, 3.7), (0.7, 0.55, 0.3), "orange", E(0, 0, 20), jitter=0.06)

# suitcase on top (black, thin red stripe, handle, latches)
SC = (0.0, 2.2, 4.4)
body.box(SC, (3.3, 2.6, 1.0), "suitcase")
body.box(SC, (3.34, 2.64, 0.07), "red")
body.box((SC[0], SC[1] - 1.34, SC[2] + 0.05), (1.0, 0.14, 0.28), "suitcase")
for dx in (-0.95, 0.95):
    body.box((SC[0] + dx, SC[1] + 1.33, SC[2] + 0.05), (0.42, 0.1, 0.26), "metal")
for sx in (-1, 1):
    for sy in (-1, 1):
        body.box((SC[0] + sx * 1.62, SC[1] + sy * 1.27, SC[2] + 0.36), (0.2, 0.2, 0.22), "metal_dark")

# tangled wires on the suitcase
for k in range(6):
    body.torus((SC[0] + random.uniform(-1.0, 0.7), SC[1] + random.uniform(-0.7, 0.7), SC[2] + 0.5 + k * 0.02),
               random.uniform(0.4, 0.7), 0.055, "wire",
               E(random.uniform(0, 70), random.uniform(0, 70), random.uniform(0, 180)))

# two decorative stars on thin stems
for sx, sz, face in ((-0.85, 0.0, 0), (0.5, 0.18, 55)):
    body.cyl((SC[0] + sx, SC[1] - 0.1, SC[2] + 0.5 + 0.55), 0.06, 1.1, "wood_light", segs=6)
    body.star((SC[0] + sx, SC[1] - 0.1, SC[2] + 1.65 + sz), 0.85 + sz * 0.5, 0.16, "star", E(0, 0, face))

# umbrellas (rolled, dark) with wooden handles at the rear end
for x, h in ((-1.55, 3.3), (-1.15, 3.0)):
    body.cyl((x, -4.55, 2.0 + h / 2), 0.17, h, "umbrella", segs=8, radius2=0.1)
    body.cyl((x, -4.55, 2.0 + h + 0.28), 0.09, 0.6, "wood_light", segs=6)
body.box((-1.35, -4.55, 3.4), (0.7, 0.1, 0.08), "wood_dark")

# ----------------------------------------------------------------------------------------------------------------------
# 4) WHEELS (separate objects; origin = hub centre; axle = local X)
# ----------------------------------------------------------------------------------------------------------------------
def make_wheel(name, radius, width, hub_r, segs, lugs):
    w = Builder(name)
    w.cyl((0, 0, 0), radius, width, "rubber", axis="X", segs=segs)
    w.cyl((0, 0, 0), hub_r, width + 0.1, "metal", axis="X", segs=max(8, segs // 2))
    w.cyl((0, 0, 0), hub_r * 0.35, width + 0.2, "metal_dark", axis="X", segs=8)
    for k in range(lugs):
        a = 2 * math.pi * k / lugs
        w.cyl((0, math.cos(a) * hub_r * 0.68, math.sin(a) * hub_r * 0.68), hub_r * 0.13, width + 0.16, "metal_dark", axis="X", segs=6)
    # tread blocks around the tyre (also makes the rotation visible)
    for k in range(segs):
        a = 2 * math.pi * (k + 0.5) / segs
        w.box((0, math.cos(a) * (radius + 0.02), math.sin(a) * (radius + 0.02)), (width * 1.02, radius * 0.16, radius * 0.07),
              "rubber", Euler((a - math.pi / 2, 0, 0)))
    return w

parts = []
parts.append(body.to_object((0, 0, 0)))
for name, sx in (("Wheel_L", -1), ("Wheel_R", 1)):
    parts.append(make_wheel(name, R_WHEEL, 0.8, R_WHEEL * 0.6, 18, 5).to_object((sx * WHEEL_X, WHEEL_Y, R_WHEEL)))
for name, sx in (("Caster_L", -1), ("Caster_R", 1)):
    parts.append(make_wheel(name, CASTER_R, 0.26, CASTER_R * 0.5, 12, 3).to_object((sx * CASTER_X, CASTER_Y, CASTER_R)))

root = bpy.data.objects.new("Kariton", None)
scene.collection.objects.link(root)
for obj, _ in parts:
    obj.parent = root

total = 0
for obj, tris in parts:
    total += tris
    print("MESH %-14s tris=%5d origin=%s" % (obj.name, tris, tuple(round(v, 2) for v in obj.location)))
print("TOTAL TRIS:", total)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "kariton.blend"), compress=True)

# ----------------------------------------------------------------------------------------------------------------------
# 5) EXPORT (FBX + GLB), only the cart objects
# ----------------------------------------------------------------------------------------------------------------------
bpy.ops.object.select_all(action="DESELECT")
root.select_set(True)
for obj, _ in parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = root

try:
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "kariton.glb"), export_format="GLB", use_selection=True,
                              export_yup=True, export_apply=True)
    print("EXPORT GLB ok")
except Exception as e:
    print("EXPORT GLB failed:", e)

fbx_ok = False
for attempt in range(2):
    try:
        if attempt == 0:
            bpy.ops.export_scene.fbx(filepath=os.path.join(OUT, "kariton.fbx"), use_selection=True, object_types={"MESH", "EMPTY"},
                                     axis_forward="-Z", axis_up="Y", global_scale=1.0, apply_unit_scale=True,
                                     apply_scale_options="FBX_SCALE_NONE", bake_space_transform=False,
                                     path_mode="COPY", embed_textures=True, mesh_smooth_type="FACE", add_leaf_bones=False)
        else:
            bpy.ops.wm.fbx_export(filepath=os.path.join(OUT, "kariton.fbx"), use_selection=True)
        fbx_ok = True
        print("EXPORT FBX ok (attempt %d)" % attempt)
        break
    except Exception as e:
        print("EXPORT FBX attempt %d failed: %s" % (attempt, e))

# ----------------------------------------------------------------------------------------------------------------------
# 6) PREVIEW RENDERS (workbench, textured) for the 4 reference views
# ----------------------------------------------------------------------------------------------------------------------
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "TEXTURE"
scene.display.shading.show_shadows = False
scene.display.shading.show_cavity = False
world = bpy.data.worlds.new("W")
world.color = (0.11, 0.11, 0.12)
scene.world = world
scene.render.resolution_x, scene.render.resolution_y = 1100, 560
scene.render.image_settings.file_format = "PNG"
cam_data = bpy.data.cameras.new("Cam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = 19.0
cam = bpy.data.objects.new("Cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
views = {"front": ((0, 60, 3.8), (90, 0, 180)), "back": ((0, -60, 3.8), (90, 0, 0)),
         "right": ((60, 2.0, 3.8), (90, 0, 90)), "left": ((-60, 2.0, 3.8), (90, 0, -90))}
for vname, (loc, rot) in views.items():
    cam.location = loc
    cam.rotation_euler = E(*rot)
    scene.render.filepath = os.path.join(PREV, "preview_%s.png" % vname)
    bpy.ops.render.render(write_still=True)
print("DONE")
