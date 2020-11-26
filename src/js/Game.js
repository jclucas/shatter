import * as THREE from 'three';
import * as CANNON from 'cannon';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

import Hand from './Hand.js';
import PhysObject from './PhysObject.js';

// assets
import plate_convex from '../assets/plate_convex.js';
import hand from '../assets/hand.obj';
import hand_grip from '../assets/hand_grip.obj';


export default class Game {

    constructor() {

        // SCENE

        this.scene = new THREE.Scene();
        this.scene_ui = new THREE.Scene();
        this.scene_cursor = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 1, 5);

        // PHYSICS WORLD

        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.8, 0);

        // RENDERER

        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);
        this.renderer.autoClear = false;

        // LIGHTING

        var light = new THREE.DirectionalLight();
        light.position.set(10, 10, 10);
        light.castShadow = true;
        this.scene.add(light);
        this.scene_cursor.add(new THREE.DirectionalLight().copy(light));

        var ambient = new THREE.AmbientLight(0x444444, 1);
        this.scene.add(ambient);
        this.scene_cursor.add(ambient.clone());

        // OBJECTS

        // obj file loader
        const loader = new OBJLoader();
        // const loader = new GLTFLoader();

        // list of all physics objects
        this.objects = [];
        var physObj = Game.readShape(plate_convex, 10);

        // add to game state
        this.add(physObj);
        physObj.body.position = new CANNON.Vec3(0, 2, 0);
        physObj.body.quaternion = new CANNON.Quaternion(0.5, 0.5, 0.5, 0);

        // add a static surface
        var table_body = new CANNON.Body({ mass: 0 });
        var table_shape = new CANNON.Box(new CANNON.Vec3(5, 0.5, 5));
        table_body.addShape(table_shape);
        this.world.addBody(table_body);
        table_body.position = new CANNON.Vec3(0, -2, 0);
        var table_geom = new THREE.BoxGeometry(10, 1, 10);
        var material = new THREE.MeshLambertMaterial({ color: 0xa0a0f0 });
        var table_mesh = new THREE.Mesh(table_geom, material);
        table_mesh.receiveShadow = true;
        this.scene.add(table_mesh);
        table_mesh.position.copy(table_body.position);

        // INTERACTION
        
        this.mouse = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();
        
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

        this.hand = new Hand(this.world);

        // bind event listeners
        window.addEventListener("mousemove", this.onMouseMove.bind(this));
        window.addEventListener("mouseup", this.onMouseUp.bind(this));
        window.addEventListener("mousedown", this.onMouseDown.bind(this));

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
        this.renderer.render(this.scene_cursor, this.camera);

    }

    onMouseMove(event) {

        // save mouse position for raycaster
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        // move cursor
        var mousePos = new THREE.Vector3(this.mouse.x, this.mouse.y, 0.98);
        mousePos = mousePos.unproject(this.camera);
        this.cursor.position.copy(mousePos);

        if (this.mouseDown) {

            // unproject mouse position into world space
            var pos = new THREE.Vector3(this.mouse.x, this.mouse.y, this.depth);
            pos = pos.unproject(this.camera);

            // update object position
            this.hand.move(pos);
            
        }
        
    }

    onMouseDown(event) {

        // get a ray from three raycaster
        this.raycaster.setFromCamera(this.mouse, this.camera);
        var ray = this.raycaster.ray;
        
        // cast into cannon world
        var result = new CANNON.RaycastResult();
        var to = ray.direction.multiplyScalar(1000).add(ray.origin);
        var hit = this.world.raycastClosest(ray.origin, to, {}, result);

        // save location of clicked camera plane
        var worldPos = new THREE.Vector3();
        worldPos.copy(result.hitPointWorld);
        this.depth = worldPos.project(this.camera).z;

        if (hit) {
            this.mouseDown = true;
            this.hand.grab(result.body, result.hitPointWorld);
            this.cursor.morphTargetInfluences[0] = 1;
        }

    }

    onMouseUp(event) {
        this.mouseDown = false;
        this.hand.release();
        this.cursor.morphTargetInfluences[0] = 0;
    }

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
     */
    static readShape(data, mass) {

        var phys_vertices = [];
        var phys_faces = [];

        // get vertices
        for (var i = 0; i < data.vertices.length; i += 3) {
            phys_vertices.push(new CANNON.Vec3(data.vertices[i], data.vertices[i+1], data.vertices[i+2]));
        }

        // get faces
        for (var i = 0; i < data.faces.length; i += 3) {
            phys_faces.push([data.faces[i], data.faces[i+1], data.faces[i+2]]);
        }

        return new PhysObject(phys_vertices, phys_faces, mass);

    }

}