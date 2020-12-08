import * as THREE from 'three';
import * as CANNON from 'cannon';

import Demo from './Demo.js';
import Hand from './Hand.js';
import Spawner from './Spawner.js';

// assets
import plate_convex from '../assets/plate_convex.js';
import table from '../assets/table.obj';
import wall from '../assets/wall.obj';
import bg from '../assets/bg.obj';
import spawner from '../assets/spawner.obj';

/** 
 * Main interactable demo
 */
export default class Game extends Demo {

    constructor() {
        super('game');
        this.init();
    }

    onMouseMoveEvent(event) {

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

    onMouseDownEvent(event) {

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

    onMouseUpEvent(event) {
        this.mouseDown = false;
        this.hand.release();
        this.spawner.onMouseUp();
        this.cursor.morphTargetInfluences[0] = 0;
    }

    initScene(scene, world, loader) {

        scene.background = new THREE.Color( 0x94bcbc );

        // add a static surface
        var table_body = new CANNON.Body({ mass: 0 });
        var table_shape = new CANNON.Box(new CANNON.Vec3(2.5, 0.6, 1));
        table_body.addShape(table_shape);
        table_body.position = new CANNON.Vec3(0, -2.5, 0);
        world.addBody(table_body);

        // load table
        loader.load(table, function(obj) {
            var table = obj.children[0];
            table.material = new THREE.MeshLambertMaterial({ color: 0x36110a });
            table.position.set(0, -2, 0);
            table.setRotationFromEuler(new THREE.Euler(0, Math.PI/2, 0));
            scene.add(table);
        }.bind(this));        

        // load background wall
        loader.load(wall, function(obj) {

            var wall = obj.children[0];
            wall.material = new THREE.MeshLambertMaterial({color: 0xffffff, vertexColors: true});
            wall.position.set(0, -1, -5);
            wall.setRotationFromEuler(new THREE.Euler(0, -Math.PI/2, 0));
            scene.add(wall);

            // add plane in physics world
            var wall_body = new CANNON.Body({ mass: 0 });
            wall_body.addShape(new CANNON.Plane());
            wall_body.position.set(new CANNON.Vec3(0, 0, -5));
            world.addBody(wall_body);

        }.bind(this));

        // load background landscape
        loader.load(bg, function(obj) {
            var bg = obj.children[0];
            bg.material = new THREE.MeshLambertMaterial({color: 0x042d2d});
            bg.position.set(0, -5, -60);
            bg.setRotationFromEuler(new THREE.Euler(0, -Math.PI/2, 0));
            scene.add(bg);
        }.bind(this));

        var sun = new THREE.Mesh(new THREE.CircleGeometry(2), 
                new THREE.MeshBasicMaterial({color: 0x8f1600}));
        sun.position.set(-10, 6, -60);
        scene.add(sun);
        
        // for interaction with physics objects
        this.hand = new Hand(world);

    }

    initUI(scene_ui, world, loader) {

        loader.load(spawner, function(obj) {
            
            var spawner_geom = obj.children[0].geometry;
            var spawner_mat = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 });
            this.spawner = new Spawner(spawner_geom, spawner_mat);
            var spawner_pos = new THREE.Vector3(-.8, .825, 0); // approx camera height = 1
            spawner_pos.unproject(this.camera);
            this.spawner.position.copy(spawner_pos);
            this.spawner.setRotationFromEuler(new THREE.Euler(Math.PI/12, -Math.PI/12, -Math.PI/12));
            
            this.spawner.setSpawnFunction(function(pos) {
                var physObj = Game.readShape(plate_convex, 10);
                physObj.init();
                physObj.body.position.copy(pos);
                physObj.body.initPosition.copy(pos);
                physObj.body.quaternion.setFromEuler(-Math.PI/2, 0, 0);
                this.hand.grab(physObj.body, new CANNON.Vec3().copy(pos));
                this.add(physObj);
            }.bind(this));
            
            scene_ui.add(this.spawner);

        }.bind(this));

    }

    onMouseDown(position, raycaster) {
        
        // cast into cannon world
        var ray = raycaster.ray;
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

    onMouseDrag(position) {
    
        // unproject mouse position into world space
        var worldPosition = new THREE.Vector3(position.x, position.y, this.depth);
        worldPosition = worldPosition.unproject(this.camera);

        // update ui element position
        this.spawner.onMouseMove(pos);

        // update object position
        this.hand.move(worldPosition);
    }

    onMouseUp() {
        this.hand.release();
        this.spawner.onMouseUp();
    }

}