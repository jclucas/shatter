import plate_convex from '../assets/plate_convex.js'
import PhysObject from './PhysObject.js'

export default class Game {
    
    objects = [];

    clicked = null;

    init() {

        // SCENE

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 1, 5);

        // PHYSICS WORLD

        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.8, 0);

        // RENDERER

        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);

        // LIGHTING

        var dirLight = new THREE.DirectionalLight();
        dirLight.position.set(10, 10, 10);
        dirLight.castShadow = true;
        this.scene.add(dirLight);

        var ambLight = new THREE.AmbientLight(0x444444, 1);
        this.scene.add(ambLight);

        // OBJECTS

        var shape = Game.readShape(plate_convex);
        
        var body = new CANNON.Body({ mass: 10 });
        body.addShape(shape);

        var physObj = new PhysObject(body);

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
        this.scene.add(table_mesh);
        table_mesh.position.copy(table_body.position);

        // INTERACTION
        
        this.mouse = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();

        // bind event listeners
        window.addEventListener("mousemove", this.onMouseMove.bind(this));
        window.addEventListener("mouseup", this.onMouseUp.bind(this));
        window.addEventListener("mousedown", this.onMouseDown.bind(this));

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

    animate = () => {

        requestAnimationFrame(this.animate);
        this.update();
        this.render();

    };

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    onMouseMove(event) {

        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        if (this.clicked) {

            // var pos = new THREE.Vector3(this.clicked.position.x, this.clicked.position.y, this.clicked.position.z);
            // var mat = this.camera.projectionMatrix;
            // pos = pos.applyMatrix4(mat);
            
            // pos.x = (pos.x * window.innerWidth / 2) + window.innerWidth / 2;
            // pos.y = -(pos.y * window.innerHeight / 2) + window.innerHeight / 2;

            // this.clicked.position.x = pos.x;
            // this.clicked.position.y = pos.y;

            this.clicked.position.x = this.mouse.x * 2;
            this.clicked.position.y = this.mouse.y * 2;
            
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

        if (hit) {

            this.clicked = result.body;
            
            // reset physics
            this.clicked.velocity.set(0,0,0);
            this.clicked.angularVelocity.set(0,0,0);
            this.clicked.vlambda.set(0,0,0);
            this.clicked.wlambda.set(0,0,0);
        }

    }

    onMouseUp(event) {

        this.clicked = null;

    }

    /**
     * Break an object. To be used outside of world.step()
     * @param {*} index 
     */
    break(index) {

        var obj = this.objects[index];
        var dist = obj.body.impact;

        // generate tesselation
        var fragments = obj.partition(dist);

        fragments.forEach(f => {

            // create and push new phys object
            this.add(new PhysObject(f));
            
        });

        // remove broken object
        this.remove(index);

    };

    /**
     * Read geometry data into a new CANNON.Shape
     * @param {*} data 
     */
    static readShape(data) {

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

        return new CANNON.ConvexPolyhedron(phys_vertices, phys_faces);

    }

}