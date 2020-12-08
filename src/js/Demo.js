import * as THREE from 'three';
import * as CANNON from 'cannon';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

import PhysObject from './PhysObject.js';

// assets
import hand from '../assets/hand.obj';
import hand_grip from '../assets/hand_grip.obj';

/**
 * Extensible class with code for physics, rendering, ui
 */
export default class Demo {

    constructor(id) {

        // DOM
        
        let element = document.getElementById(id);
        let aspect = 4 / 3;
        this.width = element.offsetWidth;
        this.height = this.width / aspect;

        // CAMERA
        
        this.camera = new THREE.PerspectiveCamera(50, aspect, 1, 1000);

        // SCENE

        this.scene = new THREE.Scene();
        this.scene_ui = new THREE.Scene();
        this.scene_cursor = new THREE.Scene();

        // PHYSICS WORLD

        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.8, 0);

        // RENDERER

        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(this.width, this.height);
        element.appendChild(this.renderer.domElement);
        this.renderer.autoClear = false;

        // bind event listeners
        element.addEventListener("mousemove", this.onMouseMoveEvent.bind(this));
        element.addEventListener("mouseup", this.onMouseUpEvent.bind(this));
        element.addEventListener("mouseout", this.onMouseUpEvent.bind(this));
        element.addEventListener("mousedown", this.onMouseDownEvent.bind(this));

    }

    init() {

        // CAMERA
        this.initCamera(this.camera);

        // LIGHTING
        let lights = [];
        this.initLighting(lights);
        lights.forEach(light => {
            this.scene.add(light);
            this.scene_ui.add(light.clone());
            this.scene_cursor.add(light.clone());
        });

        // OBJECTS

        // obj file loader
        const loader = new OBJLoader();

        // list of all physics objects
        this.objects = [];

        this.initScene(this.scene, this.world, loader);

        // INTERACTION
        
        this.mouse = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();
        this.mouseDepth = .5;
        
        // load cursor mesh
        loader.load(hand, function(obj) {
            this.cursor = obj.children[0];
            this.cursor.translateX(-10); // hide until active
            this.cursor.setRotationFromEuler(new THREE.Euler(Math.PI/2, -Math.PI/2, Math.PI/6));
            this.cursor.material = new THREE.MeshLambertMaterial({ color: 0xffffbb });
            this.scene_cursor.add(this.cursor);

            // add morph target
            loader.load(hand_grip, function(obj) {
                var target = obj.children[0];
                var target_pos = target.geometry.getAttribute('position');
                this.cursor.geometry.morphAttributes.position = [];
                this.cursor.material.morphTargets = true;
                this.cursor.geometry.morphAttributes.position.push(target_pos);
                this.cursor.updateMorphTargets();
                this.cursor.morphTargetInfluences[0] = 0;
            }.bind(this));

        }.bind(this));

        // USER INTERFACE
        this.initUI(this.scene_ui, this.world, loader);        

        // bind game loop function
        this.loop = this.loop.bind(this);

    }

    /**
     * Add a physics object to the game state
     * @param {PhysObject} obj 
     */
    add(obj) {
        
        this.scene.add(obj.mesh);
        this.world.add(obj.body);
        this.objects.push(obj);
    
    }

    /**
     * Remove a physics object from the game state
     * @param {int} index index of a PhysObject
     */
    remove(index) {

        var obj = this.objects[index];
        this.world.remove(obj.body);
        this.scene.remove(obj.mesh);
        this.objects.splice(index, 1);

    }

    /**
     * Simulate a physics step and update all children accordingly
     */
    update() {

        this.world.step(1 / 60);

        // remove any objects that are far away
        for (var i = this.objects.length - 1; i >= 0; i--) {
            if (this.objects[i].body.position.y < -5) this.remove(i);
        }
        
        // update all physics objects
        for (var i = 0; i < this.objects.length; i++) {
            this.objects[i].update();
            if (this.objects[i].body.impact) this.break(i);
        }

    }

    /**
     * Game loop function
     */
    loop() {

        requestAnimationFrame(this.loop);
        this.update();
        this.render();

    };

    render() {

        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
        this.renderer.clearDepth();
        this.renderer.render(this.scene_ui, this.camera);
        this.renderer.clearDepth();
        this.renderer.render(this.scene_cursor, this.camera);

    }

    onMouseMoveEvent(event) {

        // save mouse position for raycaster
        this.mouse.x = (event.offsetX/ this.width) * 2 - 1;
        this.mouse.y = -(event.offsetY / this.height) * 2 + 1;

        // move cursor on cursor plane
        var mousePos = new THREE.Vector3(this.mouse.x, this.mouse.y, this.mouseDepth);
        mousePos = mousePos.unproject(this.camera);
        this.cursor.position.copy(mousePos);

        this.onMouseMove(this.mouse);

        if (this.mouseDown) {            
            this.onMouseDrag(this.mouse);
        }
        
    }

    onMouseDownEvent(event) {

        this.mouseDown = true;

        // update cursor animation
        this.cursor.morphTargetInfluences[0] = 1;

        // update raycaster
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // cast into ui scene
        var ui_hit = this.raycaster.intersectObjects(this.scene_ui.children);
        if (ui_hit.length > 0) ui_hit[0].object.onMouseDown();

        this.onMouseDown(this.mouse, this.raycaster);

    }

    onMouseUpEvent(event) {
        this.mouseDown = false;
        this.onMouseUp();
        this.cursor.morphTargetInfluences[0] = 0;
    }

    /// TEMPLATE FUNCTIONS

    initCamera(camera) {

        camera.position.set(0, 0, 5);
        camera.setRotationFromEuler(new THREE.Euler(-5 * Math.PI / 180, 0, 0));

    }

    initLighting(lights) {

        let light = new THREE.DirectionalLight();
        light.position.set(10, 10, 10);
        light.castShadow = true;
        lights.push(light);

        let ambient = new THREE.AmbientLight(0x444444, 1);
        lights.push(ambient);

        let interior = new THREE.PointLight(0x222222, 1);
        interior.position.set(0, 5, 0);
        lights.push(interior);

    }

    initScene(scene, world, loader) {}

    initUI(scene, world, loader) {}

    onMouseDown(position, raycaster) {}

    onMouseUp() {}

    onMouseMove(position) {}

    onMouseDrag(position) {}

    /// HELPER FUNCTIONS
    
    /**
     * Break an object. To be used outside of world.step()
     * @param {int} index index of the object to break
     */
    break(index) {

        var obj = this.objects[index];
        var dist = obj.body.impact;

        // generate tesselation
        var fragments = obj.partition(dist);

        fragments.forEach(f => {

            // create and push new phys object
            this.add(f);
            
        });

        // remove broken object
        this.remove(index);

    };

    /**
     * Create a PhysObject directly from a file specifying its geometry
     * @param {*} data 
     * @param {Number} mass of object
     * @return {PhysObject}
     */
    static readShape(data, mass) {

        var phys_vertices = [];

        // get vertices
        for (var i = 0; i < data.vertices.length; i += 3) {
            phys_vertices.push(new CANNON.Vec3(data.vertices[i], data.vertices[i+1], data.vertices[i+2]));
        }

        return new PhysObject(phys_vertices, data.faces, mass);

    }

}