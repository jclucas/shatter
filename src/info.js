import * as THREE from 'three';
import * as CANNON from 'cannon';
var Voronoi = require('voronoi');

import Demo from "./js/Demo.js"
import PhysObject from './js/PhysObject.js';

// assets
import plate_convex from './assets/plate_convex.js';
import hammer from './assets/hammer.obj';

require('./style.css');

let demo1 = new Demo('demo1');

// breakable object
let plate = Demo.readShape(plate_convex, 10);
plate.body.sleep();

// 2d points for voronoi diagram
let sites_in = [];

// world space points for breaking
let points_world = [];

// points to render
let points_geom = new THREE.BufferGeometry();
let points_index = 0;
let MAX_POINTS = 25;
points_geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array( MAX_POINTS * 3 ), 3));
points_geom.setDrawRange(0, 0);
let points_mat = new THREE.PointsMaterial({ color: 0x042d2d, size: 0.05 });
let points = new THREE.Points(points_geom, points_mat);
points.onMouseDown = () => {};

// calculated voronoi diagram
let diagram;
let edges2d = [];
let sites_out = [];
let edges_geom = new THREE.BufferGeometry();
edges_geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array( MAX_POINTS * 3 ), 3));
let edges_mat = new THREE.LineBasicMaterial({ color: 0x042d2d });
let edges = new THREE.LineSegments(edges_geom, edges_mat);
edges.onMouseDown = () => {};

// break button
var button;

var break_function = () => {

    // get dividing planes
    let planes = PhysObject.getDividingPlanes(edges2d, new THREE.Vector3(0, 0, 1));

    // start physics
    plate.body.wakeUp();
    plate.body.applyLocalForce(new CANNON.Vec3(0, 0, -1000), new CANNON.Vec3(0, 0, 0));

    // break based on saved points
    let fragments = plate.break(sites_out, planes);

    fragments.forEach(f => {
        // create and push new phys object
        f.body.removeEventListener("collide", f.onCollide);
        demo1.add(f);
    });

    // remove broken object
    demo1.remove(0);

    // turn off overlays
    points.visible = false;
    edges.visible = false;
    button.visible = false;
    button.onMouseDown = () => {};

}


demo1.initCamera = function(camera) {
    camera.position.set(0, 2, 0);
    camera.setRotationFromEuler(new THREE.Euler(-Math.PI/2, 0, 0));
}

demo1.initScene = function(scene, world, loader) {
    
    // set up visuals
    scene.background = new THREE.Color( 0x94bcbc );
    
    // add breakable
    plate.body.quaternion.setFromEuler(-Math.PI/2, 0, 0);
    plate.init();
    this.add(plate);
    
    // add invisible plane
    let plane_shape = new CANNON.Plane()
    let plane = new CANNON.Body().addShape(plane_shape);
    plane.position.set(0, -0.5, 0);
    plane.quaternion.setFromEuler(-Math.PI/2, 0, 0);
    world.add(plane);
    
}

demo1.initUI = function(scene, world, loader) {
    scene.add(points);
    scene.add(edges);

    // break button
    loader.load(hammer, function(obj) {
        button = obj.children[0];
        button.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
        button.scale.set(0.1, 0.1, 0.1);
        button.position.set(0.9, 0, -0.7);
        button.setRotationFromEuler(new THREE.Euler(0, -Math.PI/8, 0));
        button.onMouseDown = break_function;
        scene.add(button);
    });
    
}

demo1.onMouseDown = function(position, raycaster) {

    // get clicked position on 
    let inter = raycaster.intersectObject(plate.mesh);

    if (inter.length > 0) {

        let hit = inter[0].point;

        // add to buffer geometry
        let index = 3 * points_index;
        let attr = points.geometry.getAttribute('position');
        attr.array[index] = hit.x;
        attr.array[index + 1] = hit.y;
        attr.array[index + 2] = hit.z;
        attr.needsUpdate = true;
        sites_in[points_index] = { x: hit.x, y: -hit.z };
        points_world[points_index] = new CANNON.Vec3(hit.x, hit.y, hit.z)
        points_geom.setDrawRange(0, sites_in.length);
        points_index = (points_index + 1) % MAX_POINTS;

        // update voronoi diagram
        diagram = new Voronoi().compute(sites_in, {xl: -2, xr: 2, yt: -1, yb: 1});
        let segments = [];
        edges2d = [];
        sites_out = [];
        diagram.cells.forEach(cell => {
            let loop = [];
            cell.halfedges.forEach(edge => {
                var v1 = edge.getStartpoint();
                var v2 = edge.getEndpoint();
                segments.push(new THREE.Vector3(v1.x, 0, -v1.y));
                segments.push(new THREE.Vector3(v2.x, 0, -v2.y));
                loop.push(new CANNON.Vec3(v1.x, v1.y, 0))
            });
            edges2d.push(loop);
            sites_out.push(new CANNON.Vec3(cell.site.x, cell.site.y, 0))
        });
        edges.geometry.setFromPoints(segments);
        edges.geometry.setDrawRange(0, segments.length);

    }

}

demo1.init();
demo1.loop();

