import * as CANNON from 'cannon';

/**
* In-game "hand" for interacting with objects.
*/
export default class Hand {

    /**
     * Constructor
     * @param {CANNON.PhysicsWorld} world 
     */
    constructor(world) {

        // physics world
        this.world = world;

        // body to which held objects are constrained
        this.joint = new CANNON.Body({ mass: 0 });
        this.joint.addShape(new CANNON.Sphere(0.1));
        this.joint.collisionFilterGroup = 0;
        this.joint.collisionFilterMask = 0;
        this.world.add(this.joint);

        // point-to-point constraint
        this.constraint = null;

    }

    /**
     * Pick up an object
     * @param {CANNON.Body} body selected object
     * @param {CANNON.Vec3} pos world position of mouse click
     */
    grab(body, pos) {

        // move joint to click position
        this.joint.position.copy(pos);

        // calculate pivot point (object space)
        var relPos = pos.vsub(body.position);
        var antiRot = body.quaternion.inverse();
        var pivot = antiRot.vmult(relPos);

        // create and add constraint
        this.constraint = new CANNON.PointToPointConstraint(body, pivot, this.joint, new CANNON.Vec3(0,0,0));
        this.world.addConstraint(this.constraint);

    }

    /**
     * Let go of the currently held object
     */
    release() {

        // remove constraint
        this.world.removeConstraint(this.constraint);
        this.constraint = false;
    
    }

    /**
     * Move the joint body to a new mouse position
     * @param {CANNON.Vec3} pos world space mouse position
     */
    move(pos) {
        this.joint.position.copy(pos);
        this.constraint.update();
    }

}