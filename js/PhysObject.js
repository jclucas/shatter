export default class PhysObject {

    /**
     * Read geometry to a new physics object.
     * @param {CANNON.Body} body
     */
    constructor(body) {

        // add to cannon.js world
        this.body = body;

        // add to three.js scene
        var material = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 });
        this.mesh = new THREE.Mesh(this.createGeometry(body.shapes[0]), material);
        
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

        // generate list of new bodies
        var bodies = [];

        bounds.forEach(bound => {

            var newBody = new CANNON.Body({mass: this.body.mass / 4});
            newBody.addShape(bound);
            newBody.position.copy(this.body.position);
            newBody.quaternion.copy(this.body.quaternion);
            bodies.push(newBody);

        });

        var worldImpact = 1;

        bodies[0].position.x += worldImpact;
        bodies[0].position.y += worldImpact;
        bodies[1].position.x -= worldImpact;
        bodies[1].position.y += worldImpact;
        bodies[2].position.x -= worldImpact;
        bodies[2].position.y -= worldImpact;
        bodies[3].position.x += worldImpact;
        bodies[3].position.y -= worldImpact;

        return bodies;

    };
    
    /**
     * Mark an object to be broken in the next update.
     * @param {*} event 
     */
    onCollide(event) {

        // cannon ContactEquation
        var collision = event.contact;
        var body = event.target;
        var relv = body.mass * collision.getImpactVelocityAlongNormal();
        
        if (relv < 50) {
            return;
        }

        // vector from obj center to collision point
        var dist = (body == collision.bi) ? collision.ri : collision.rj;

        this.impact = dist;

    };

}