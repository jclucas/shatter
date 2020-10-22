import plate_convex from '../assets/plate_convex.js'
import PhysObject from './PhysObject.js'

export default class Game {
    
    objects = [];

    onClick() {

    }


    onMouseMove(event) {

    }

    init() {

        // SCENE

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 1, 5);

        // PHYSICS WORLD

        this.world = new CANNON.World();
        this.world.gravity.set(0, -10, 0);

        // RENDERER

        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);

        // LIGHTING

        var pointLight = new THREE.PointLight();
        pointLight.position.set(0, 10, 0);
        this.scene.add(pointLight);

        var ambLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambLight);

        // OBJECTS

        var shape = Game.readShape(plate_convex);
        
        var body = new CANNON.Body({ mass: 100 });
        body.addShape(shape);

        var physObj = new PhysObject(body);

        // add to game state
        this.add(physObj);
        physObj.body.position = new CANNON.Vec3(0, 2, 0);
        physObj.body.quaternion = new CANNON.Quaternion(0.5, 0.5, 0.5, 0);

        // add collision callback
        physObj.body.addEventListener("collide", this.onCollide);

        // add a static surface
        var table_body = new CANNON.Body({ mass: 0 });
        var table_shape = new CANNON.Box(new CANNON.Vec3(5, 0.5, 5));
        table_body.addShape(table_shape);
        this.world.addBody(table_body);
        table_body.position = new CANNON.Vec3(0, -2, 0);
        var table_geom = new THREE.BoxGeometry(10, 1, 10);
        var material = new THREE.MeshStandardMaterial({ color: 0xa0a0f0 });
        var table_mesh = new THREE.Mesh(table_geom, material);
        this.scene.add(table_mesh);
        table_mesh.position.copy(table_body.position);

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

        // remove physics bodies
        // obj.bodies.forEach(body => {
        //     this.world.removeBody(body);
        // });

        // remove render objects
        // obj.mesh.objects.for
        // this.scene.remove(obj.mesh)


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

    /**
     * Mark an object to be broken in the next update.
     * @param {*} event 
     */
    onCollide(event) {

        // cannon ContactEquation
        var collision = event.contact;

        var body = event.body;

        // vector from obj center to collision point
        var dist = (body == collision.bi) ? collision.ri : collision.rj;

        this.impact = dist;

    };

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