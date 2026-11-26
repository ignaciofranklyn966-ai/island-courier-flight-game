// Island Courier — bridge from the vendored classic Three.js build to
// the game's ES modules.
//
// game/index.html loads vendor/three.min.js as a classic script first, so
// by the time any module runs, window.THREE exists. This shim simply hands
// that global to the modules as their THREE object. It loads nothing over
// the network and contains no library code of its own.

const THREE = window.THREE;

export default THREE;
