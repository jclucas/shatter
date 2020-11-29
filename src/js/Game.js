import * as THREE from 'three';
import * as CANNON from 'cannon';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

import Hand from './Hand.js';
import PhysObject from './PhysObject.js';
import Spawner from './Spawner.js';

// assets
import plate_convex from '../assets/plate_convex.js';
import hand from '../assets/hand.obj';
import hand_grip from '../assets/hand_grip.obj';
import table from '../assets/table.obj';
import wall from '../assets/wall.obj';
import bg from '../assets/bg.obj';
import spawner from '../assets/spawner.obj';

export default class Game {

    constructor() {

        // DOM
        
        var game = document.getElementById('game');
        var aspect = 4 / 3;
        this.width = game.offsetWidth;
        this.height = this.width / aspect;

        // SCENE

        this.scene = new THREE.Scene();
        this.scene_ui = new THREE.Scene();
        this.scene_cursor = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(50, aspect, 1, 1000);
        this.camera.position.set(0, 0, 5);
        this.camera.setRotationFromEuler(new THREE.Euler(-5 * Math.PI / 180, 0, 0));
        this.scene.background = new THREE.Color( 0x94bcbc );

        // PHYSICS WORLD

        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.8, 0);

        // RENDERER

        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(this.width, this.height);
        game.appendChild(this.renderer.domElement);
        this.renderer.autoClear = false;

        // LIGHTING

        var light = new THREE.DirectionalLight();
        light.position.set(10, 10, 10);
        light.castShadow = true;
        this.scene.add(light);
        this.scene_ui.add(new THREE.DirectionalLight().copy(light));
        this.scene_cursor.add(new THREE.DirectionalLight().copy(light));

        var ambient = new THREE.AmbientLight(0x444444, 1);
        this.scene.add(ambient);
        this.scene_ui.add(ambient.clone());
        this.scene_cursor.add(ambient.clone());

        var interior = new THREE.PointLight(0x222222, 1);
        interior.position.set(0, 5, 0);
        this.scene.add(interior);
        this.scene_ui.add(interior.clone());
        this.scene_cursor.add(interior.clone());

        // OBJECTS

        // obj file loader
        const loader = new OBJLoader();

        // list of all physics objects
        this.objects = [];

        // add a static surface
        var table_body = new CANNON.Body({ mass: 0 });
        var table_shape = new CANNON.Box(new CANNON.Vec3(2.5, 0.1, 1));
        table_body.addShape(table_shape);
        table_body.position = new CANNON.Vec3(0, -2, 0);
        this.world.addBody(table_body);

        // load table
        loader.load(table, function(obj) {
            var table = obj.children[0];
            table.material = new THREE.MeshLambertMaterial({ color: 0x36110a });
            table.position.copy(table_body.position);
            table.setRotationFromEuler(new THREE.Euler(0, Math.PI/2, 0));
            this.scene.add(table);
        }.bind(this));        

        // load background wall
        loader.load(wall, function(obj) {

            var wall = obj.children[0];
            wall.material = new THREE.MeshLambertMaterial({color: 0xffffff, vertexColors: true});
            wall.position.set(0, -1, -5);
            wall.setRotationFromEuler(new THREE.Euler(0, -Math.PI/2, 0));
            this.scene.add(wall);

            // add plane in physics world
            var wall_body = new CANNON.Body({ mass: 0 });
            wall_body.addShape(new CANNON.Plane());
            wall_body.position.set(new CANNON.Vec3(0, 0, -5));
            this.world.addBody(wall_body);

        }.bind(this));

        // load background landscape
        loader.load(bg, function(obj) {
            var bg = obj.children[0];
            bg.material = new THREE.MeshLambertMaterial({color: 0x042d2d});
            bg.position.set(0, -5, -60);
            bg.setRotationFromEuler(new THREE.Euler(0, -Math.PI/2, 0));
            this.scene.add(bg);
        }.bind(this));

        var sun = new THREE.Mesh(new THREE.CircleGeometry(2), 
                new THREE.MeshBasicMaterial({color: 0x8f1600}));
        sun.position.set(-10, 6, -60);
        this.scene.add(sun);

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

        this.hand = new Hand(this.world);

        // bind event listeners
        game.addEventListener("mousemove", this.onMouseMove.bind(this));
        game.addEventListener("mouseup", this.onMouseUp.bind(this));
        game.addEventListener("mouseout", this.onMouseUp.bind(this));
        game.addEventListener("mousedown", this.onMouseDown.bind(this));

        // USER INTERFACE

        loader.load(spawner, function(obj) {var spawner_geom = new THREE.BoxGeometry(1, 1, 1);
            
            var spawner_geom = obj.children[0].geometry;
            var spawner_mat = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 });
            this.spawner = new Spawner(spawner_geom, spawner_mat);
            var spawner_pos = new THREE.Vector3(-.8, .825, 0); // approx camera height = 1
            spawner_pos.unproject(this.camera);
            this.spawner.position.copy(spawner_pos);
            this.spawner.setRotationFromEuler(new THREE.Euler(Math.PI/12, -Math.PI/12, -Math.PI/12));
            
            this.spawner.setSpawnFunction(function(pos) {
                var physObj = Game.readShape(plate_convex, 10);
                physObj.body.position.copy(pos);
                physObj.body.initPosition.copy(pos);
                physObj.body.quaternion.setFromEuler(-Math.PI/2, 0, 0);
                this.hand.grab(physObj.body, new CANNON.Vec3().copy(pos));
                this.add(physObj);
            }.bind(this));
            
            this.scene_ui.add(this.spawner);

        }.bind(this));
        

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

    onMouseMove(event) {

        // save mouse position for raycaster
        this.mouse.x = (event.offsetX/ this.width) * 2 - 1;
        this.mouse.y = -(event.offsetY / this.height) * 2 + 1;

        // move cursor on cursor plane
        var mousePos = new THREE.Vector3(this.mouse.x, this.mouse.y, this.mouseDepth);
        mousePos = mousePos.unproject(this.camera);
        this.cursor.position.copy(mousePos);

        if (this.mouseDown) {

            // unproject mouse position into world space
            var pos = new THREE.Vector3(this.mouse.x, this.mouse.y, this.depth);
            pos = pos.unproject(this.camera);

            // update object position
            this.hand.move(pos);

            // update ui element position
            this.spawner.onMouseMove(pos);
            
        }
        
    }

    onMouseDown(event) {

        this.mouseDown = true;

        // update cursor animation
        this.cursor.morphTargetInfluences[0] = 1;

        // get a ray from three raycaster
        this.raycaster.setFromCamera(this.mouse, this.camera);
        var ray = this.raycaster.ray;

        // cast into ui scene
        var ui_hit = this.raycaster.intersectObjects(this.scene_ui.children);
        if (ui_hit.length > 0) ui_hit[0].object.onMouseDown();
        
        // cast into cannon world
        var result = new CANNON.RaycastResult();
        var to = ray.direction.multiplyScalar(1000).add(ray.origin);
        var phys_hit = this.world.raycastClosest(ray.origin, to, {}, result);

        if (phys_hit) {
            this.hand.grab(result.body, result.hitPointWorld);
        }

        // save location of clicked camera plane
        var worldPos = new THREE.Vector3();
        worldPos.copy(result.hitPointWorld);
        this.depth = worldPos.project(this.camera).z;

    }

    onMouseUp(event) {
        this.mouseDown = false;
        this.hand.release();
        this.spawner.onMouseUp();
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