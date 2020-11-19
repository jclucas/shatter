import * as THREE from 'three';
import * as CANNON from 'cannon';

export default class PhysObject {

    /**
     * Read geometry to a new physics object.
     * @param {Array} vertices array of CANNON.Vec3 vertices
     * @param {Array} faces array of arrays of vertex indices
     * @param {Number} mass of CANNON.Body
     */
    constructor(vertices, faces, mass) {

        // create cannon.js body
        var shape = new CANNON.ConvexPolyhedron(vertices, faces);
        this.body = new CANNON.Body({ mass: mass });
        this.body.addShape(shape);

        // create three.js mesh
        var material = new THREE.MeshPhongMaterial({ color: 0xf0f0f0 });
        this.mesh = new THREE.Mesh(this.createGeometry(shape), material);
        
        // add collision callback
        this.body.addEventListener("collide", this.onCollide);

    };

    /**
     * Create a THREE.Geometry from a given shape
     * @param {CANNON.Shape} shape 
     */
    createGeometry(shape) {

        var geometry = new THREE.Geometry();

        // get vertices
        for (var i = 0; i < shape.vertices.length; i++) {
            geometry.vertices.push(new THREE.Vector3(shape.vertices[i].x, shape.vertices[i].y, shape.vertices[i].z));
        }

        // get faces
        for (var i = 0; i < shape.faces.length; i++) {

            if (shape.faces[i].length == 3) {
                geometry.faces.push(new THREE.Face3(shape.faces[i][0], shape.faces[i][1], shape.faces[i][2]));
            } else {

                // get face normal
                var v1 = shape.vertices[shape.faces[i][0]];
                var v2 = shape.vertices[shape.faces[i][1]];
                var v3 = shape.vertices[shape.faces[i][2]];
                var x = new THREE.Vector3();
                var y = new THREE.Vector3();
                var n = new THREE.Vector3();
                n.crossVectors(x.subVectors(v2, v1), y.subVectors(v2, v3));

                // get coordinate system where z = n
                x.subVectors(v1, v2);
                y.crossVectors(x, n);
                var mat = new THREE.Matrix3();
                mat.set(x.x, x.y, x.z, y.x, y.y, y.z, n.x, n.y, n.z);
                
                var pts = [];

                shape.faces[i].forEach(v => {
                    // var proj = geometry.vertices[v].clone();
                    var proj = new THREE.Vector3(shape.vertices[v].x, shape.vertices[v].y, shape.vertices[v].z);
                    proj.applyMatrix3(mat);
                    pts.push(new THREE.Vector2(proj.x, proj.y));
                });

                // var face = new THREE.Shape(pts);
                var tris = THREE.ShapeUtils.triangulateShape(pts, []);

                tris.forEach(t => {
                    geometry.faces.push(new THREE.Face3(shape.faces[i][t[0]], shape.faces[i][t[1]], shape.faces[i][t[2]]));
                });

            }

        }

        geometry.computeBoundingSphere();
        geometry.computeFaceNormals();

        return geometry;
        
    };

    /**
     * Copy position from physics simulation to rendered mesh
     */
    update() {

        this.mesh.position.copy(this.body.position);
        this.mesh.quaternion.copy(this.body.quaternion);

    };

    /**
     * Partition geometry based on an impact point.
     * Fortune's algorithm goes here.
     * @param {CANNON.Vec3} impact 
     */
    partition(impact) {

        // generate points
        var points = this.generatePoints(impact)

        var bounds = [];

        // find dividing planes
        // FORTUNE GOES HERE

        // TEMP: split bounding box into 4

        // create 4 polyhedra from boxes
        var size = this.body.shapes[0].boundingSphereRadius / 2 ;
        for (var i = 0; i < 4; i++) {
            var box = new CANNON.Box(new CANNON.Vec3(size, size, size));
            box.updateConvexPolyhedronRepresentation();
            bounds.push(box.convexPolyhedronRepresentation);
        }

        // generate list of new objects
        var objects = [];

        for (var i = 0; i < bounds.length; i++) {
            var bound = bounds[i];
            var fragment = this.clip(bound);
            fragment.body.position.copy(this.body.position);
            
            var offset = impact.vadd(points[i]);
            fragment.body.position.vadd(offset);
            fragment.body.quaternion.copy(this.body.quaternion);
            objects.push(fragment);
        }

        return objects;

    }

    /**
     * Generate a set of seed points
     * @param {int} number of points to generate
     * @param {CANNON.Vec3} center impact point
     * @param {*} radius 
     */
    generatePoints(number, center, radius) {

        var points = [];

        // TEMP: split bounding box into 4
        var size = this.body.shapes[0].boundingSphereRadius / 2 ;
        points.push(new CANNON.Vec3(size, 0, size));
        points.push(new CANNON.Vec3(-size, 0, size));
        points.push(new CANNON.Vec3(-size, 0, -size));
        points.push(new CANNON.Vec3(size, 0, -size));

        return points;

    }

    clip(bound) {
        return new PhysObject(bound.vertices, bound.faces, this.body.mass / 4);
    }
    
    /**
     * Mark an object to be broken in the next update.
     * @param {*} event 
     */
    onCollide(event) {

        // cannon ContactEquation
        var collision = event.contact;
        var body = event.target;
        var relv = body.mass * collision.getImpactVelocityAlongNormal();
        
        if (relv < 20) {
            return;
        }

        // vector from obj center to collision point
        var dist = (body == collision.bi) ? collision.ri : collision.rj;

        this.impact = dist;

    };

}