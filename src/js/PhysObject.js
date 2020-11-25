import * as THREE from 'three';
import * as CANNON from 'cannon';
var ConvexHull = require('convex-hull');

const EPSILON = 1e-5;

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
        var material = new THREE.MeshPhongMaterial({ 
            color: 0xf0f0f0, 
            // side: THREE.DoubleSide,
            // wireframe: true
        });
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
                var mat = getProjectionMatrix(x, n);
                
                var pts = [];

                shape.faces[i].forEach(v => {
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
     * @return {Array} of new PhysObjects to add to the game state
     */
    partition(impact) {

        // generate points
        var points = this.generatePoints(impact)

        // find dividing planes
        var bounds = this.segment(points);

        // generate list of new bodies
        var objects = [];

        // clip each bound and create a new object
        for (var i = 0; i < bounds.length; i++) {
            var fragment = this.clip(bounds[i], points[i]);
            fragment.body.updateBoundingRadius();
            fragment.body.position.copy(this.body.position.vadd(points[i]));
            fragment.body.quaternion.copy(this.body.quaternion);
            fragment.update();
            objects.push(fragment);
        }

        return objects;

    };

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
        points.push(new CANNON.Vec3(size, size, 0));
        points.push(new CANNON.Vec3(-size, size, 0));
        points.push(new CANNON.Vec3(-size, -size, 0));
        points.push(new CANNON.Vec3(size, -size, 0));

        return points;

    }

    /**
     * Generate a segmentation based on a set of points
     * TODO: FORTUNE GOES HERE!
     * @param {Array} points
     * @return {Array} list of edge loops
     */
    segment(points) {

        // TEMP: create 4 quadrants
        var s = this.body.shapes[0].boundingSphereRadius;
        var bounds = []

        bounds.push([new CANNON.Vec3(0, 0, 0), new CANNON.Vec3(0, s, 0),
            new CANNON.Vec3(s, s, 0), new CANNON.Vec3(s, 0, 0)]);
        bounds.push([new CANNON.Vec3(0, 0, 0), new CANNON.Vec3(-s, 0, 0),
                new CANNON.Vec3(-s, s, 0), new CANNON.Vec3(0, s, 0)]);
        bounds.push([new CANNON.Vec3(0, 0, 0), new CANNON.Vec3(0, -s, 0),
            new CANNON.Vec3(-s, -s, 0), new CANNON.Vec3(-s, 0, 0)]);
        bounds.push([new CANNON.Vec3(0, 0, 0), new CANNON.Vec3(s, 0, 0),
                new CANNON.Vec3(s, -s, 0), new CANNON.Vec3(0, -s, 0)]);

        return bounds;

    }

    /**
     * 
     * @param {Array} loop array of points defining a voronoi cell
     * @return {CANNON.Shape}
     */
    clip(loop, center) {

        // convert edge loop to list of planes
        var planes = [];
        const up = new CANNON.Vec3(0, 0, 1);
        
        for (var i = 0; i < loop.length; i++) {

            var curr = loop[i];
            var prev = loop[(i + loop.length - 1) % loop.length];
            
            // find normal
            var n = up.cross(curr.vsub(prev));
            n.normalize();

            // create plane
            var p = new THREE.Plane();
            p.setFromNormalAndCoplanarPoint(n, curr);
            planes.push(p);

        }

        // start with the current geometry
        var vertices = this.body.shapes[0].vertices;
        var faces = this.body.shapes[0].faces;
        var inFaces, inVertices;
        var outVertices = vertices;
        var outFaces = faces; 

        // clip each segment against each plane
        planes.forEach(plane => {

            // use previous output as current input
            inVertices = outVertices;
            inFaces = outFaces;
            outVertices = [];
            outFaces = [];
            var interPoints = [];
            var proj = getProjectionMatrix(up, plane.normal);

            // keep track of existing vertices with changed indices
            var moved = [];
            for (var i = 0; i < inVertices.length; i++) {
                moved[i] = -1;
            }

            // process each face
            for (var f = 0; f < inFaces.length; f++) {

                var inFace = inFaces[f];
                var outFace = [];
                const len = outVertices.length;
                const a = inVertices[inFace[0]];
                const b = inVertices[inFace[1]];
                const c = inVertices[inFace[2]];
                const faceNormal = c.vsub(a).cross(b.vsub(a));
                const coplanarInside = faceNormal.dot(plane.normal) > 0;
                
                // process each segment in the face
                for (var i = 0; i < inFace.length; i++) {

                    // get vertex indices
                    var currIdx = inFace[i];
                    var prevIdx = inFace[(i + inFace.length - 1) % inFace.length];
                    
                    // check both points
                    var curr = inVertices[currIdx];
                    var prev = inVertices[prevIdx];
                    var currInside = plane.distanceToPoint(curr) < EPSILON;
                    var prevInside = plane.distanceToPoint(prev) < EPSILON;

                    var currCoplanar = currInside && plane.distanceToPoint(curr) > -EPSILON;
                    var prevCoplanar = prevInside && plane.distanceToPoint(prev) > -EPSILON;

                    if (currCoplanar && !coplanarInside) {
                        currInside = false;
                    }

                    if (prevCoplanar && !coplanarInside) {
                        prevInside = false;
                    }

                    // get intersection with bounding plane
                    var inter3 = new THREE.Vector3;
                    plane.intersectLine(new THREE.Line3(prev, curr), inter3);
                    var inter = new CANNON.Vec3().copy(inter3);

                    if (currInside) {

                        if (!prevInside) {
                            outFace.push(outVertices.length);
                            interPoints.push(inter);
                            outVertices.push(inter);
                        }
                        
                        var newIdx;

                        // have we seen this vertex before
                        if (moved[currIdx] == -1) {
                            newIdx = outVertices.length;
                            outVertices.push(curr);
                            moved[currIdx] = newIdx;
                        } else {
                            newIdx = moved[currIdx];
                        }

                        outFace.push(newIdx);

                    } else if (prevInside) {
                        outFace.push(outVertices.length);
                        interPoints.push(inter);
                        outVertices.push(inter);
                    }

                }
                
                // clean up degenerate face
                if (outFace.length < 3) {
                    if (outFace.length !== 0) outVertices = outVertices.splice(len - 1);
                    continue;
                }
                
                outFaces.push(outFace);

            }

            // if (interPoints.length < 3) return;

            // // get vertex order for face along plane
            // var interPointsArray = [];
            // var cannonMat = new CANNON.Mat3().copy(proj);
            // interPoints.forEach(v => {
            //     // convert to tangent space
            //     var tan = new CANNON.Vec3();
            //     cannonMat.vmult(v, tan);
            //     interPointsArray.push([tan.x, tan.y]);
            // });

            // // array of pairs of indices into interPointsArray
            // var hull = ConvexHull(interPointsArray);
            
            // // don't create degenerate face
            // if (hull.length == 0) return;

            // var hullIdxs = [];
            // hull.forEach(edge => {
            //     var pt = interPoints[edge[1]];
            //     hullIdxs.push(outVertices.length);
            //     outVertices.push(pt);
            // });

            // outFaces.push(hullIdxs);

        });
        
        // temp(?) use convex hull instead of calculated faces
        var hullVertices = [];
        outVertices.forEach(v => {
            hullVertices.push(v.toArray())
        });

        var hull = new ConvexHull(hullVertices);

        // move vertices so center is at 0,0,0 in object space
        for (var i = 0; i < outVertices.length; i++) {
            outVertices[i] = outVertices[i].vsub(center);
        }

        // create and return new PhysObject
        return new PhysObject(outVertices, hull, this.body.mass / 4);

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

/**
 * 3D -> 2D projection matrix. Projects to a tangent space, z = n
 * @param {THREE.Vector3} t tangent
 * @param {THREE.Vector3} n normal
 * @returns {THREE.Matrix3} projection matrix
 */
function getProjectionMatrix(t, n) {
    var b = new THREE.Vector3();
    b.crossVectors(n, t);
    var mat = new THREE.Matrix3();
    mat.set(b.x, b.y, b.z, t.x, t.y, t.z, n.x, n.y, n.z);
    return mat;
}