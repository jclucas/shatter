import * as THREE from 'three';
import * as CANNON from 'cannon';
var Voronoi = require('voronoi');

const EPSILON = 1e-5;

export default class PhysObject {

    /**
     * Read geometry to a new physics object.
     * @param {Array} vertices array of CANNON.Vec3 vertices
     * @param {Array} faces array of arrays of vertex indices
     * @param {Number} mass of CANNON.Body
     */
    constructor(vertices, faces, mass, edges=null) {

        // create cannon.js body
        var shape = new CANNON.ConvexPolyhedron(vertices, faces);
        this.body = new CANNON.Body({ mass: mass });
        this.body.addShape(shape);

        // compute edges if not provided
        if (edges == null) {
            this.computeEdges();
        } else {
            this.edges = edges;
        }

    };

    /**
     * Create visual and gameplay components
     */
    init() {

        // create three.js mesh
        var material = new THREE.MeshPhongMaterial({ color: 0xf0f0f0 });
        this.mesh = new THREE.Mesh(this.createGeometry(this.body.shapes[0]), material);
        
        // add collision callback
        this.body.addEventListener("collide", this.onCollide);

    }

    /**
     * Populates edge array based on vertices and faces.
     */
    computeEdges() {

        // array of arrays of edges
        this.edges = [];

        // map of vertex pairs to edge indices
        var vertexPairs = new Map();
        let len = this.body.shapes[0].vertices.length;
        var faces = this.body.shapes[0].faces;

        faces.forEach(f => {

            var loop = [];

            for (var i = 0; i < f.length; i++) {

                // get index of each point
                var a = f[i];
                var b = f[(i + 1) % f.length];

                if (vertexPairs.has(a * len + b)) {
                    loop.push(vertexPairs.get(a * len + b));
                } else {

                    // create new edge
                    var edge = {a: a, b: b};
                    var reverse = {a: b, b: a};
                    edge.reverse = reverse;
                    reverse.reverse = edge;

                    // save edge
                    vertexPairs.set(a * len + b, edge);
                    vertexPairs.set(b * len + a, reverse);
                    loop.push(edge);

                }

            }

            this.edges.push(loop);

        });

    }

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
     * Break geometry based on an impact point.
     * @param {CANNON.Vec3} impact 
     * @return {Array} of new PhysObjects to add to the game state
     */
    breakOnImpact(impact) {

        // generate points
        var radius = this.body.shapes[0].boundingSphereRadius / 2 ;
        var points = this.generatePoints(5, impact.scale(.5), radius);

        // find dividing edges
        var edges = this.segment(points);

        // convert to planes
        const up = new CANNON.Vec3(0, 0, 1);
        let bounds = PhysObject.getDividingPlanes(edges, up);
        
        // generate fragments
        return this.break(points, bounds);

    };

    /**
     * Generate a set of seed points
     * @param {int} number of points to generate
     * @param {CANNON.Vec3} center impact point
     * @param {*} radius 
     */
    generatePoints(number, center, radius) {

        var points = [];

        for (var i = 0; i < number; i++) {
            var r = Math.random() * radius;
            var angle = Math.round(Math.random() * 360);
            var pt = new CANNON.Vec3().copy(center);
            pt.x += r * Math.cos(angle);
            pt.y += r * Math.sin(angle);
            points.push(pt);
        }

        return points;

    }

    /**
     * Generate a segmentation based on a set of points
     * @param {Array} points
     * @return {Array} list of edge loops
     */
    segment(points) {

        // generate voronoi diagram
        var vertices = [];
        var s = this.body.shapes[0].boundingSphereRadius * 2;
        points.forEach(p => {
            vertices.push({x: p.x, y: p.y});
        });
        var diagram = new Voronoi().compute(vertices, {xl: -s, xr: s, yt: -s, yb: s});

        // clear points list so we can add them in order
        points.splice(0, points.length);
        var edges = [];
        
        // extract edge loops from cells
        diagram.cells.forEach(cell => {
            var loop = [];
            cell.halfedges.forEach(edge => {
                var v = edge.getStartpoint();
                loop.push(new CANNON.Vec3(v.x, v.y, 0));
            });
            edges.push(loop);
            points.push(new CANNON.Vec3(cell.site.x, cell.site.y, 0));
        });

        return edges;

    }

    /**
     * Generate new PhysObj fragments
     * @param {Array} points 
     * @param {Array} bounds 
     */
    break(points, bounds) {

        // generate list of new bodies
        var objects = [];

        // clip each bound and create a new object
        for (var i = 0; i < bounds.length; i++) {

            var fragment = this;

            for (var j = 0; j < bounds[i].length; j++) {
                if (fragment == null) continue;
                let center = (j == bounds[i].length - 1) ? points[i] : new CANNON.Vec3(0, 0, 0);
                fragment = fragment.clip(bounds[i][j], center);
            }

            if (fragment == null) continue;

            // create and place fragment
            fragment.init();
            var offset = this.body.quaternion.vmult(points[i]);
            fragment.body.position.copy(this.body.position.vadd(offset));
            fragment.body.quaternion.copy(this.body.quaternion);

            // adjust physics properties
            let relMass = fragment.body.shapes[0].volume() / this.body.shapes[0].volume();
            fragment.body.mass *= relMass;
            fragment.body.velocity.copy(this.body.velocity).scale(relMass);
            fragment.body.angularVelocity.copy(this.body.angularVelocity).scale(relMass);
            fragment.body.inertia.copy(this.body.inertia);
            fragment.body.force.copy(this.body.force);
            fragment.body.updateMassProperties();
            fragment.update();
            objects.push(fragment);
        }

        return objects;

    }

    /**
     * 
     * @param {THREE.Plane} plane to clip the object against
     * @return {CANNON.Shape} or null
     */
    clip(plane, center) {

        // copy current geometry
        var vertices = this.body.shapes[0].vertices;
        var faces = this.body.shapes[0].faces;
        var inVertices = [];
        // var inVertices = [...vertices];
        var inFaces = [];
        var inEdges = [];

        // deep copy vertices
        vertices.forEach(vertex => {
            let newv = new CANNON.Vec3();
            newv.copy(vertex);
            inVertices.push(newv);
        });

        // deep copy face arrays
        faces.forEach(face => {
            inFaces.push([...face]);
        });

        // deep copy edge objects
        let edgeMap = new Map();
        let len = this.body.shapes[0].vertices.length;
        for (let i = 0; i < this.edges.length; i++) {
            inEdges.push([]);
            for (let j = 0; j < this.edges[i].length; j++) {
                let edge = this.edges[i][j];
                if (edgeMap.has(edge.a * len + edge.b)) {
                    inEdges[i].push(edgeMap.get(edge.a * len + edge.b));
                } else {
                    let copy = Object.assign({}, this.edges[i][j]);
                    let revCopy = Object.assign({}, this.edges[i][j].reverse);
                    copy.reverse = revCopy;
                    revCopy.reverse = copy;
                    inEdges[i].push(copy);
                    edgeMap.set(edge.a * len + edge.b, copy);
                    edgeMap.set(edge.b * len + edge.a, revCopy);
                }
            }
        }
        
        var outVertices = [];
        var outFaces = [];
        var outEdges = [];
        var inter = [];

        const INSIDE = 0;
        const OUTSIDE = 1;
        const INTERSECT = 2;
        const COPLANAR = 3;

        // mark each vertex as in, out, coplanar
        var vertexTest = []
        inVertices.forEach(v => {
            var point = new THREE.Vector3().copy(v);
            var dist = plane.distanceToPoint(point);
            var result = (dist < EPSILON) ? INSIDE : OUTSIDE;
            if (result == INSIDE && dist > -EPSILON) result = COPLANAR;
            vertexTest.push(result);
        });

        var edgesTest = new Map();

        // process edges
        inEdges.forEach(face => {

            face.forEach(edge => {

                var a = edge.a;
                var b = edge.b;

                if (edgesTest.has(edge)) {
                    // skip processed edges
                    return;
                } else if (vertexTest[a] == INSIDE && vertexTest[b] == INSIDE) {
                    // fully inside edge
                    edgesTest.set(edge, INSIDE);
                    edgesTest.set(edge.reverse, INSIDE);
                } else if (vertexTest[a] != vertexTest[b]) {
    
                    // get intersection with bounding plane
                    var inter3 = new THREE.Vector3;
                    plane.intersectLine(new THREE.Line3(inVertices[a], inVertices[b]), inter3);
                    var inter = new CANNON.Vec3().copy(inter3);
    
                    // replace clipped endpoint with intersection
                    const index = inVertices.length;

                    if (vertexTest[a] == COPLANAR || vertexTest[b] == COPLANAR) {
                        // special cases for coplanar points
                        if (vertexTest[a] == OUTSIDE || vertexTest[b] == OUTSIDE) {
                            // coplanar + outside = outside
                            edgesTest.set(edge, OUTSIDE);
                            edgesTest.set(edge.reverse, OUTSIDE);
                        } else {
                            if (vertexTest[b] == INSIDE) {
                                edge.a = index;
                                edge.reverse.b = index;
                            } else {
                                edge.b = index;
                                edge.reverse.a = index;
                            }
                            edgesTest.set(edge, INTERSECT);
                            edgesTest.set(edge.reverse, INTERSECT);
                        }
                    } else {

                        if (vertexTest[b] == INSIDE) {
                            edge.a = index;
                            edge.reverse.b = index;
                        } else {
                            edge.b = index;
                            edge.reverse.a = index;
                        }
    
                        edgesTest.set(edge, INTERSECT);
                        edgesTest.set(edge.reverse, INTERSECT);
                    }

                    // vertexTest[inVertices.length] = INTERSECT;
                    inVertices.push(inter);
    
                } else {
                    edgesTest.set(edge, OUTSIDE);
                    edgesTest.set(edge.reverse, OUTSIDE);
                }

            });

        });

        // classify each face
        let facesTest = [];
        inEdges.forEach(face => {
            let faceStatus = COPLANAR;
            face.forEach(edge => {
                let status = edgesTest.get(edge);
                if (status == INTERSECT) {
                    faceStatus = INTERSECT;
                } else if (faceStatus != INTERSECT && status != COPLANAR) {
                    faceStatus = status;
                }
            });
            facesTest.push(faceStatus);
        });

        // process each face
        for (var f = 0; f < inFaces.length; f++) {
            
            if (facesTest[f] == INSIDE || facesTest[f] == COPLANAR) {
                // face is unchanged
                outFaces.push(inFaces[f]);
                outEdges.push(inEdges[f]);
                continue;
            } else if (facesTest[f] == OUTSIDE) {
                // skip face
                continue;
            }

            var inFace = inFaces[f];
            var inLoop = inEdges[f];
            var outFace = [];
            var outLoop = [];

            // find vertices that occur only once
            let count = new Map();
            inLoop.forEach(edge => {
                if (edgesTest.get(edge) == OUTSIDE) return;
                count.has(edge.a) ? count.get(edge.a).value++ : count.set(edge.a, {value: 1});
                count.has(edge.b) ? count.get(edge.b).value++ : count.set(edge.b, {value: 1});
            });

            let start = -1;
            let end = -1;
            count.forEach((number, index) => {
                if (number.value == 1) {
                    (start == -1) ? start = index : end = index;
                }
            });

            if (start == -1 || end == -1) {
                console.log("shouldn't happen: could not find clip edge")
            }
            
            // add missing segment
            let newEdge = {a: start, b: end};
            let revNewEdge = {a: end, b: start};
            newEdge.reverse = revNewEdge;
            revNewEdge.reverse = newEdge;
            edgesTest.set(newEdge, COPLANAR);
            edgesTest.set(newEdge.reverse, COPLANAR);

            // find an included vertex to start at
            let index = 0;
            while (!(vertexTest[inLoop[index].a] == INSIDE)) {
                index++;
            }

            let closed = false;
            for (let i = 0; i < inLoop.length; i++) {

                let curr = (index + i) % inLoop.length;
                let edge = inLoop[curr];
                let status = edgesTest.get(edge);

                if (status == OUTSIDE) {
                    continue;
                }

                if (status == INTERSECT && !closed) {
                    outFace.push(edge.a);
                    outFace.push(edge.b);
                    outLoop.push(edge);
                    let next = (edge.b == newEdge.a) ? newEdge : newEdge.reverse;
                    outLoop.push(next);
                    inter.push(next.reverse);
                    closed = true;
                } else {
                    outFace.push(edge.a);
                    outLoop.push(edge);
                }

            }
            
            // skip degenerate faces
            if (outFace.length < 3) {
                continue;
            }
            
            outFaces.push(outFace);
            outEdges.push(outLoop);

        }

        // create missing face in clip plane
        if (inter.length >= 3) {

            let interFace = [];
            let interLoop = [];

            // loop through edges
            let edges = new Map();
            inter.forEach(edge => {
                edges.set(edge.a, edge);
            });

            let next = inter[0];
            for (let i = 0; i < inter.length; i++) {
                interLoop.push(next);
                interFace.push(next.a);
                next = edges.get(next.b);
            }

            outFaces.push(interFace);
            outEdges.push(interLoop);

        }

        if (outFaces.length < 4) {
            return null;
        }

        // reindex vertices to remove unused
        var movedVertices = [];
        for (var i = 0; i < inVertices.length; i++) {
            movedVertices[i] = -1;
        }
        
        for (let i = 0; i < outFaces.length; i++) {
            for (let j = 0; j < outFaces[i].length; j++) {
                let v = outFaces[i][j];
                if (movedVertices[v] == -1) {
                    movedVertices[v] = outVertices.length;
                    outFaces[i][j] = outVertices.length;
                    outVertices.push(inVertices[v]);
                } else {
                    outFaces[i][j] = movedVertices[v];
                }
            }
        }

        // get unique edges
        var edges = new Set();
        for (let i = 0; i < outEdges.length; i++) {
            for (let j = 0; j < outEdges[i].length; j++) {
                let edge = outEdges[i][j];
                if (!(edges.has(edge) || edges.has(edge.reverse))) {
                    edges.add(edge);
                }
            }
        }

        // update indices
        edges.forEach(edge => {
            edge.a = movedVertices[edge.a];
            edge.b = movedVertices[edge.b];
            edge.reverse.a = movedVertices[edge.reverse.a];
            edge.reverse.b = movedVertices[edge.reverse.b];
        });

        // move vertices so center is at 0,0,0 in object space
        for (var i = 0; i < outVertices.length; i++) {
            outVertices[i] = outVertices[i].vsub(center);
        }       

        // create and return new PhysObject
        return new PhysObject(outVertices, outFaces, this.body.mass, outEdges);

    }
    
    /**
     * Mark an object to be broken in the next update.
     * @param {*} event 
     */
    onCollide(event) {

        // cannon ContactEquation
        var collision = event.contact;
        var body = event.target;
        var momentum = body.mass * collision.getImpactVelocityAlongNormal();
        
        // don't break on gentle impact
        if (momentum < 60) {
            return;
        }

        // vector from obj center to collision point
        var dist = (body == collision.bi) ? collision.ri : collision.rj;

        this.impact = dist;

    };

    /**
     * Generate a set of halfplanes from a set of edges
     * @param {Array} edges 
     * @param {THREE.Vector3} up 
     */
    static getDividingPlanes(edges, up) {
        
        var bounds = [];

        // convert edge loop to list of planes
        edges.forEach(loop => {
            var planes = [];
            for (var i = 0; i < loop.length; i++) {

                var curr = loop[i];
                var next = loop[(i + 1) % loop.length];
                
                // find normal
                var n = new THREE.Vector3();
                n.crossVectors(up, next.vsub(curr));
                n.normalize();

                // create plane
                var p = new THREE.Plane();
                p.setFromNormalAndCoplanarPoint(n, curr);
                planes.push(p);

            }
            bounds.push(planes);
        });

        return bounds;

    }

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