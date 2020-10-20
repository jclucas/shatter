export default class PhysObject {

    /**
     * Read geometry to a new physics object.
     * @param {*} data list of vertices/triangles
     */
    constructor(data) {

        var geometry = new THREE.Geometry();
        var phys_vertices = [];
        var phys_faces = [];

        // get vertices
        for (var i = 0; i < data.vertices.length; i += 3) {
            geometry.vertices.push(new THREE.Vector3(data.vertices[i], data.vertices[i+1], data.vertices[i+2]));
            phys_vertices.push(new CANNON.Vec3(data.vertices[i], data.vertices[i+1], data.vertices[i+2]));
        }

        // get faces
        for (var i = 0; i < data.faces.length; i += 3) {
            geometry.faces.push(new THREE.Face3(data.faces[i], data.faces[i+1], data.faces[i+2]));
            phys_faces.push([data.faces[i], data.faces[i+1], data.faces[i+2]]);
        }

        // add to three.js scence
        var material = new THREE.MeshStandardMaterial({ color: 0xf0f0f0 });
        this.mesh = new THREE.Mesh(geometry, material);

        // add to cannon.js world
        this.body = new CANNON.Body({ mass: 1 });
        this.body.addShape(new CANNON.ConvexPolyhedron(phys_vertices, phys_faces));

    };

    /**
     * Copy position from physics simulation to rendered mesh
     */
    update() {

        this.mesh.position.copy(this.body.position);
        this.mesh.quaternion.copy(this.body.quaternion);

    };

}