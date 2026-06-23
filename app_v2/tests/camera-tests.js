(function () {
  "use strict";

  function near(a, b, tolerance = 1e-6) {
    return Math.abs(a - b) <= tolerance;
  }

  function vectorNear(a, b, tolerance = 1e-6) {
    return a.length === b.length && a.every((value, i) => near(value, b[i], tolerance));
  }

  function runPopupCameraTests() {
    const api = window.POPUP_TEST_API;
    const cases = [
      {
        name: "quaternion axis rotation",
        fn: () => {
          const q = api.quatFromAxisAngle([0, 1, 0], Math.PI / 2);
          return vectorNear(api.quatRotateVec(q, [1, 0, 0]), [0, 0, -1]);
        }
      },
      {
        name: "quaternion multiplication composes rotations",
        fn: () => {
          const qx = api.quatFromAxisAngle([1, 0, 0], Math.PI / 3);
          const qy = api.quatFromAxisAngle([0, 1, 0], Math.PI / 4);
          const v = [0.3, 0.7, -0.2];
          const composed = api.quatRotateVec(api.quatMultiply(qy, qx), v);
          const sequential = api.quatRotateVec(qy, api.quatRotateVec(qx, v));
          return vectorNear(composed, sequential);
        }
      },
      {
        name: "quaternion interpolation remains normalized",
        fn: () => {
          const a = api.quatFromAxisAngle([1, 0, 0], 0.2);
          const b = api.quatFromAxisAngle([0, 1, 0], 1.4);
          const q = api.quatNlerp(a, b, 0.45);
          return near(Math.hypot(...q), 1) && api.quatAngleBetween(a, q) > 0 && api.quatAngleBetween(q, b) > 0;
        }
      },
      {
        name: "camera easing starts fast and settles slowly",
        fn: () => api.easeOutQuint(0) === 0
          && api.easeOutQuint(1) === 1
          && api.easeOutQuint(0.25) > 0.7
          && 1 - api.easeOutQuint(0.9) < 0.0001
      }
    ];

    return cases.map(test => {
      try {
        if (!test.fn()) throw Error("Expectation returned false.");
        return { name: test.name, ok: true };
      } catch (error) {
        return { name: test.name, ok: false, error: error.message || String(error) };
      }
    });
  }

  window.runPopupCameraTests = runPopupCameraTests;
})();
