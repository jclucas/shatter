function init() {

    

}

import PhysObject from './PhysObject.js'

// SCENE

var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1, 5);

// PHYSICS WORLD

var world = new CANNON.World();
world.gravity.set(0, -10, 0);

// RENDERER

var renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// LIGHTING

var pointLight = new THREE.PointLight();
pointLight.position.set(0, 10, 0);
scene.add(pointLight);

var ambLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambLight);

// OBJECTS

var physObj = new PhysObject(plate_convex);

// add to three.js scence
scene.add(physObj.mesh);

// add to cannon.js world
world.add(physObj.body);
physObj.body.position = new CANNON.Vec3(0, 2, 0);
physObj.body.quaternion = new CANNON.Quaternion(0.5, 0.5, 0.5, 0);

// add a static surface
var table_body = new CANNON.Body({ mass: 0 });
var table_shape = new CANNON.Box(new CANNON.Vec3(5, 0.5, 5));
table_body.addShape(table_shape);
world.addBody(table_body);
table_body.position = new CANNON.Vec3(0, -2, 0);
var table_geom = new THREE.BoxGeometry(10, 1, 10);
var material = new THREE.MeshStandardMaterial({ color: 0xa0a0f0 });
var table_mesh = new THREE.Mesh(table_geom, material);
scene.add(table_mesh);
table_mesh.position.copy(table_body.position);

function animate() {

    requestAnimationFrame(animate);
    world.step(1 / 60);
    physObj.update();
    render();

};

function render() {
    renderer.render(scene, camera);
}

init();
animate();