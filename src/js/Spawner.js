import * as THREE from 'three';

export default class Spawner extends THREE.Mesh {

    constructor(geometry, material) {
        super(geometry, material);
        this.pos = new THREE.Vector3();
        this.clicked = false;
        this.spawned = false;
        this.initial = null;
    }

    onMouseMove(pos) {

        // save new mouse position
        this.pos = pos;

        // if click & drag
        if (this.clicked) {

            if (this.initial == null) {
                // set initial mouse pos if unset
                this.initial = pos;
            } else if (pos.sub(this.initial).length() > 1 && !this.spawned) {
                // if dragged, spawn object
                this.spawn(pos.add(this.initial));
                this.spawned = true;
            }

        }

    }

    onMouseDown() {
        this.clicked = true;
    }

    onMouseUp() {
        this.clicked = false;
        this.spawned = false;
        this.initial = null;
    }

    setSpawnFunction(func) {
        this.spawn = func;
    }

}