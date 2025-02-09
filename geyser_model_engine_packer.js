var export_action;


function compileAnimationJson() {

    var animations = {}
    Animator.animations.forEach(function (a) {
        let ani_tag = a.compileBedrockAnimation();
        animations[a.name] = ani_tag;
    })
    return {
        format_version: '1.8.0',
        animations: animations
    }

}

function calculateVisibleBox() {
    var visible_box = new THREE.Box3()
    Canvas.withoutGizmos(() => {
        Cube.all.forEach(cube => {
            if (cube.export && cube.mesh) {
                visible_box.expandByObject(cube.mesh);
            }
        })
    })

    var offset = new THREE.Vector3(8, 8, 8);
    visible_box.max.add(offset);
    visible_box.min.add(offset);

    // Width
    var radius = Math.max(
        visible_box.max.x,
        visible_box.max.z,
        -visible_box.min.x,
        -visible_box.min.z
    )
    if (Math.abs(radius) === Infinity) {
        radius = 0
    }
    let width = Math.ceil((radius * 2) / 16)
    width = Math.max(width, Project.visible_box[0]);
    Project.visible_box[0] = width;

    //Height
    let y_min = Math.floor(visible_box.min.y / 16);
    let y_max = Math.ceil(visible_box.max.y / 16);
    if (y_min === Infinity) y_min = 0;
    if (y_max === Infinity) y_max = 0;
    y_min = Math.min(y_min, Project.visible_box[2] - Project.visible_box[1] / 2);
    y_max = Math.max(y_max, Project.visible_box[2] + Project.visible_box[1] / 2);

    Project.visible_box.replace([width, y_max - y_min, (y_max + y_min) / 2])

    return Project.visible_box;
}

(function () {

    // Parse

    function parseCube(s, group) {
        var base_cube = new Cube({
            name: s.name || group.name,
            autouv: 0,
            color: group.color,
            rotation: s.rotation,
            origin: s.pivot
        })
        base_cube.rotation.forEach(function (br, axis) {
            if (axis != 2) base_cube.rotation[axis] *= -1
        })
        base_cube.origin[0] *= -1;
        if (s.origin) {
            base_cube.from.V3_set(s.origin)
            base_cube.from[0] = -(base_cube.from[0] + s.size[0])
            if (s.size) {
                base_cube.to[0] = s.size[0] + base_cube.from[0]
                base_cube.to[1] = s.size[1] + base_cube.from[1]
                base_cube.to[2] = s.size[2] + base_cube.from[2]
            }
        }
        if (s.uv instanceof Array) {
            base_cube.uv_offset[0] = s.uv[0]
            base_cube.uv_offset[1] = s.uv[1]
            base_cube.box_uv = true;
        } else if (s.uv) {
            base_cube.box_uv = false;
            for (var key in base_cube.faces) {
                var face = base_cube.faces[key]
                if (s.uv[key]) {
                    face.extend({
                        material_name: s.uv[key].material_instance,
                        uv: [
                            s.uv[key].uv[0],
                            s.uv[key].uv[1]
                        ],
                        rotation: s.uv[key].uv_rotation
                    })
                    if (s.uv[key].uv_size) {
                        face.uv_size = [
                            s.uv[key].uv_size[0],
                            s.uv[key].uv_size[1]
                        ]
                    } else {
                        base_cube.autouv = 1;
                        base_cube.mapAutoUV();
                    }
                    if (key == 'up' || key == 'down') {
                        face.uv = [face.uv[2], face.uv[3], face.uv[0], face.uv[1]]
                    }
                } else {
                    face.texture = null;
                    face.uv = [0, 0, 0, 0],
                        face.rotation = 0;
                }
            }

        }
        if (s.inflate && typeof s.inflate === 'number') {
            base_cube.inflate = s.inflate;
        }
        if (s.mirror === undefined) {
            base_cube.mirror_uv = group.mirror_uv;
        } else {
            base_cube.mirror_uv = s.mirror === true;
        }
        base_cube.addTo(group).init();
        return base_cube;
    }
    function parseBone(b, bones, parent_list) {
        var group = new Group({
            name: b.name,
            origin: b.pivot,
            rotation: b.rotation,
            material: b.material,
            bedrock_binding: b.binding,
            color: Group.all.length % markerColors.length
        }).init()
        group.createUniqueName();
        bones[b.name] = group
        if (b.pivot) {
            group.origin[0] *= -1
        }
        group.rotation.forEach(function (br, axis) {
            if (axis !== 2) group.rotation[axis] *= -1
        })

        group.mirror_uv = b.mirror === true
        group.reset = b.reset === true

        if (b.cubes) {
            b.cubes.forEach(function (s) {
                parseCube(s, group)
            })
        }
        if (b.locators) {
            for (let key in b.locators) {
                let coords, rotation, ignore_inherited_scale;
                if (b.locators[key] instanceof Array) {
                    coords = b.locators[key];
                } else {
                    coords = b.locators[key].offset;
                    rotation = b.locators[key].rotation;
                    ignore_inherited_scale = b.locators[key].ignore_inherited_scale;
                }
                coords[0] *= -1;
                if (rotation instanceof Array) {
                    rotation[0] *= -1;
                    rotation[1] *= -1;
                }
                if (key.substr(0, 6) == '_null_' && b.locators[key] instanceof Array) {
                    new NullObject({ from: coords, name: key.substr(6) }).addTo(group).init();
                } else {
                    new Locator({ position: coords, name: key, rotation, ignore_inherited_scale }).addTo(group).init();
                }
            }
        }
        if (b.texture_meshes instanceof Array) {
            b.texture_meshes.forEach(tm => {
                let texture = Texture.all.find(tex => tex.name == tm.texture);
                let texture_mesh = new TextureMesh({
                    texture_name: tm.texture,
                    texture: texture ? texture.uuid : null,
                    origin: tm.position,
                    rotation: tm.rotation,
                    local_pivot: tm.local_pivot,
                    scale: tm.scale,
                })
                texture_mesh.local_pivot[2] *= -1;
                texture_mesh.origin[1] *= -1;

                if (b.pivot) texture_mesh.origin[1] += b.pivot[1];

                texture_mesh.origin[0] *= -1;
                texture_mesh.rotation[0] *= -1;
                texture_mesh.rotation[1] *= -1;
                texture_mesh.addTo(group).init();
            })
        }
        if (b.children) {
            b.children.forEach(function (cg) {
                cg.addTo(group);
            })
        }
        var parent_group = 'root';
        if (b.parent) {
            if (bones[b.parent]) {
                parent_group = bones[b.parent]
            } else {
                parent_list.forEach(function (ib) {
                    if (ib.name === b.parent) {
                        ib.children && ib.children.length ? ib.children.push(group) : ib.children = [group]
                    }
                })
            }
        }
        group.addTo(parent_group)
    }
    function parseGeometry(data) {

        let { description } = data.object;
        let geometry_name = (description.identifier && description.identifier.replace(/^geometry\./, '')) || '';

        Project.geometry_name = geometry_name;
        Project.texture_width = 16;
        Project.texture_height = 16;

        if (typeof description.visible_bounds_width == 'number' && typeof description.visible_bounds_height == 'number') {
            Project.visible_box[0] = Math.max(Project.visible_box[0], description.visible_bounds_width || 0);
            Project.visible_box[1] = Math.max(Project.visible_box[1], description.visible_bounds_height || 0);
            if (description.visible_bounds_offset && typeof description.visible_bounds_offset[1] == 'number') {
                Project.visible_box[2] = description.visible_bounds_offset[1] || 0;
            }
        }

        if (description.texture_width !== undefined) {
            Project.texture_width = description.texture_width;
        }
        if (description.texture_height !== undefined) {
            Project.texture_height = description.texture_height;
        }

        if (data.object.item_display_transforms !== undefined) {
            DisplayMode.loadJSON(data.object.item_display_transforms)
        }

        var bones = {}

        if (data.object.bones) {
            var included_bones = []
            data.object.bones.forEach(function (b) {
                included_bones.push(b.name)
            })
            data.object.bones.forEach(function (b) {
                parseBone(b, bones, data.object.bones)
            })
        }

        Project.box_uv = Cube.all.filter(cube => cube.box_uv).length > Cube.all.length / 2;

        Canvas.updateAllBones()
        setProjectTitle()
        Validator.validate()
        updateSelection()
    }

    // Compile.textures

    function compileCube(cube, bone) {
        var template = {
            origin: cube.from.slice(),
            size: cube.size(),
            inflate: cube.inflate || undefined,
        }
        if (cube.box_uv) {
            template = new oneLiner(template);
        }
        template.origin[0] = -(template.origin[0] + template.size[0])

        if (!cube.rotation.allEqual(0)) {
            template.pivot = cube.origin.slice();
            template.pivot[0] *= -1;

            template.rotation = cube.rotation.slice();
            template.rotation.forEach(function (br, axis) {
                if (axis != 2) template.rotation[axis] *= -1
            })
        }

        if (cube.box_uv) {
            template.uv = cube.uv_offset;
            if (cube.mirror_uv === !bone.mirror) {
                template.mirror = cube.mirror_uv
            }
        } else {
            template.uv = {};
            for (var key in cube.faces) {
                var face = cube.faces[key];
                if (face.texture !== null) {
                    template.uv[key] = new oneLiner({
                        uv: [
                            face.uv[0],
                            face.uv[1],
                        ],
                        uv_size: [
                            face.uv_size[0],
                            face.uv_size[1],
                        ]
                    });
                    if (face.rotation) {
                        template.uv[key].uv_rotation = face.rotation;
                    }
                    if (face.material_name) {
                        template.uv[key].material_instance = face.material_name;
                    }
                    if (key == 'up' || key == 'down') {
                        template.uv[key].uv[0] += template.uv[key].uv_size[0];
                        template.uv[key].uv[1] += template.uv[key].uv_size[1];
                        template.uv[key].uv_size[0] *= -1;
                        template.uv[key].uv_size[1] *= -1;
                    }
                }
            }
        }
        return template;
    }
    function compileGroup(g, bones, config) {
        if (g.type !== 'group' || g.export == false) return;
        if (!settings.export_empty_groups.value && !g.children.find(child => child.export)) return;
        if (g.name.startsWith("b_")) return;
        //Bone
        var bone = {}
        bone.name = g.name
        if (g.parent.type === 'group') {
            bone.parent = g.parent.name
        }
        bone.pivot = g.origin.slice()
        bone.pivot[0] *= -1
        if (!g.rotation.allEqual(0)) {
            bone.rotation = g.rotation.slice()
            bone.rotation[0] *= -1;
            bone.rotation[1] *= -1;
        }
        if (g.bedrock_binding) {
            bone.binding = g.bedrock_binding
        }
        if (g.reset) {
            bone.reset = true
        }
        if (g.mirror_uv && Project.box_uv) {
            bone.mirror = true
        }
        if (g.material) {
            bone.material = g.material
        }
        // Elements
        var cubes = []
        var locators = {};
        var texture_meshes = [];

        var textures_cubes = {};

        for (var obj of g.children) {
            if (obj.export) {
                
                if (obj instanceof Cube) {

                    let template = compileCube(obj, bone);
                    
                    var texture;

                    for (var face in obj.faces) {
                        if (obj.faces[face].texture !== null) {
                            texture = Texture.all.findInArray('uuid', obj.faces[face].texture);
                            
                            
                            if (texture == null || texture.name == undefined) {
                                continue
                            }
                            texture_name = texture.name.replace("_e.png", ".png");
                            texture = Texture.all.findInArray('name', texture_name)
                            
                            break
                        }
                    }

                    if (texture == null || texture.name == undefined) {
                        continue
                    }

                    if (textures_cubes[texture.name] == null) {
                        var cube_name = "uv_" + bone.name + Object.keys(textures_cubes).length
                        textures_cubes[texture.name] = {
                            name: cube_name,
                            pivot: [0, 0, 0],
                            parent: bone.name,
                            cubes: []
                        };
                    } 
                    textures_cubes[texture.name].cubes.push(template);
                    

                } else if (obj instanceof Locator || obj instanceof NullObject) {
                    let key = obj.name;
                    if (obj instanceof NullObject) key = '_null_' + key;
                    let offset = obj.position.slice();
                    offset[0] *= -1;

                    if ((obj.rotatable && !obj.rotation.allEqual(0)) || obj.ignore_inherited_scale) {
                        locators[key] = {
                            offset
                        };
                        if (obj.rotatable) {
                            locators[key].rotation = [
                                -obj.rotation[0],
                                -obj.rotation[1],
                                obj.rotation[2]
                            ]
                        }
                        if (obj.ignore_inherited_scale) {
                            locators[key].ignore_inherited_scale = true;
                        }
                    } else {
                        locators[key] = offset;
                    }
                } else if (obj instanceof TextureMesh) {
                    let texmesh = {
                        texture: obj.texture_name,
                        position: obj.origin.slice(),
                    }
                    texmesh.position[0] *= -1;
                    texmesh.position[1] -= bone.pivot[1];
                    texmesh.position[1] *= -1;

                    if (!obj.rotation.allEqual(0)) {
                        texmesh.rotation = [
                            -obj.rotation[0],
                            -obj.rotation[1],
                            obj.rotation[2]
                        ]
                    }
                    if (!obj.local_pivot.allEqual(0)) {
                        texmesh.local_pivot = obj.local_pivot.slice();
                        texmesh.local_pivot[2] *= -1;
                    }
                    if (!obj.scale.allEqual(1)) {
                        texmesh.scale = obj.scale.slice();
                    }
                    texture_meshes.push(texmesh);
                }
            }
        }

        if (cubes.length) {
            bone.cubes = cubes
        }
        for (let key in textures_cubes) {
            let c = textures_cubes[key];
            if (Object.keys(textures_cubes).length > 1) {
                bones.push(c)
            } else {
                bone.cubes = c.cubes
            }
            
            if (config !== null) {
                var tname = key
            
                tname = tname.replace('.png', '')
                if (config.binding_bones[tname] == null) {
                    config.binding_bones[tname] = []
                }

                if (Object.keys(textures_cubes).length > 1) {
                    config.binding_bones[tname].push(c.name)
                } else {
                    config.binding_bones[tname].push(bone.name)
                }
            }
        }
        if (texture_meshes.length) {
            bone.texture_meshes = texture_meshes
        }
        if (Object.keys(locators).length) {
            bone.locators = locators
        }
        return bone;
    }


    function getFormatVersion() {
        if (Format.display_mode) {
            let has_new_displays = false;
            for (let i in DisplayMode.slots) {
                let key = DisplayMode.slots[i]
                if (Project.display_settings[key] && Project.display_settings[key].export) {
                    let data = Project.display_settings[key].export();
                    if (data) {
                        return '1.21.20';
                    }
                }
            }
        }
        for (let cube of Cube.all) {
            for (let fkey in cube.faces) {
                if (cube.faces[fkey].rotation) return '1.21.0';
            }
        }
        if (Group.all.find(group => group.bedrock_binding)) return '1.16.0';
        return '1.12.0';
    }

    var codec = {
        name: 'GeyserModelEngine Model',
        extension: 'gmeg',
        remember: true,
        multiple_per_file: true,
        compile(options, config) {
            if (options === undefined) options = {}

            var entitymodel = {}
            var main_tag = {
                format_version: getFormatVersion(),
                'minecraft:geometry': [entitymodel]
            }
            entitymodel.description = {
                identifier: 'geometry.' + (Project.geometry_name || 'unknown'),
                texture_width: Project.texture_width || 16,
                texture_height: Project.texture_height || 16,
            }
            var bones = []

            var groups = getAllGroups();
            var loose_elements = [];
            Outliner.root.forEach(obj => {
                if (obj instanceof OutlinerElement) {
                    loose_elements.push(obj)
                }
            })
            if (loose_elements.length) {
                let group = new Group({
                    name: 'bb_main'
                });
                group.children.push(...loose_elements);
                group.is_catch_bone = true;
                group.createUniqueName();
                groups.splice(0, 0, group);
            }
            groups.forEach(function (g) {
                let bone = compileGroup(g, bones, config)
                if (bone !== undefined) {
                    bones.push(bone)
                }
            })


            if (bones.length) {

                let visible_box = calculateVisibleBox();
                entitymodel.description.visible_bounds_width = visible_box[0] || 0;
                entitymodel.description.visible_bounds_height = visible_box[1] || 0;
                entitymodel.description.visible_bounds_offset = [0, visible_box[2] || 0, 0]
            }
            if (bones.length) {
                entitymodel.bones = bones
            }

            let new_display = {};
            let has_new_displays = false;
            for (let i in DisplayMode.slots) {
                let key = DisplayMode.slots[i]
                if (Project.display_settings[key] && Project.display_settings[key].export) {
                    new_display[key] = Project.display_settings[key].export();
                    if (new_display[key]) has_new_displays = true;
                }
            }
            if (has_new_displays) {
                entitymodel.item_display_transforms = new_display
            }


            return main_tag;

        },
        fileName() {
            var name = Project.name || 'model';
            if (!name.match(/\.geo$/)) {
                name += '.geo';
            }
            return name;
        }
    }

    codec.parseCube = parseCube;
    codec.parseBone = parseBone;
    codec.parseGeometry = parseGeometry;
    codec.compileCube = compileCube;
    codec.compileGroup = compileGroup;





    BBPlugin.register('geyser_model_engine_packer', {
        title: 'GeyserModelEnginePacker',
        author: 'zimzaza4',
        icon: 'bar_chart',
        description: '',
        tags: [],
        version: '0.0.1',
        min_version: '4.8.0',
        variant: 'both',
        onload() {
            export_action = new Action({
                id: 'export_geysermodelengine',
                name: 'Export GeyserModelEngine Model',
                icon: 'icon-format_bedrock',
                category: 'file',
                click: function () {

                    let zip = new JSZip();
                    let folder = zip.folder(Project.name);

                    var model_config = {
                        head_rotation: true,
                        material: "entity_alphatest_change_color_one_sided",
                        blend_transition: true,
                        per_texture_uv_size: {},
                        binding_bones: {},
                        anim_textures: {}
                    }

                    Texture.all.forEach(texture => {
                        var name = texture.name.replace('.png', '')
                        if (texture.frameCount > 1) {
                            model_config.anim_textures[name] = {
                                frames: texture.frameCount,
                                fps: 7.0
                            }
                        }

                        model_config.per_texture_uv_size[name] = [texture.uv_width, texture.uv_height]

                        folder.file(name + '.png', texture.getBase64(), { base64: true });
                    });

                    folder.file(Project.name + ".geo.json", JSON.stringify(codec.compile(null, model_config)))
                    folder.file(Project.name + ".animation.json", JSON.stringify(compileAnimationJson()))
                    folder.file("config.json", JSON.stringify(model_config))
                    zip.generateAsync({ type: 'blob' }).then(content => {
                        Blockbench.export({
                            type: "Zip Archive",
                            extensions: ["zip"],
                            name: Project.name + ".zip",
                            savetype: "zip",
                            content: content,
                        })
                    });
                }
            })

            MenuBar.addAction(export_action, 'file.export');

        },
        onunload() {
            export_action.delete();
        }
    });

})()
