(function () {
  "use strict";

  function popupOperatorTestCases(api) {
    const {
      examples,
      max,
      min,
      blend,
      clamp,
      mirror,
      pad,
      repeat,
      concat,
      offset,
      recursiveCornerCubes,
      sampledSphere,
      subdividedSphere,
      progressiveSubdividedSphere,
      interleavedSampledSphere,
      sampledCone,
      sampledRidge,
      normalizeSugaredDesign,
      validate,
      pretty,
      clone,
      hsum,
      sum
    } = api;

    return [
      {
        name: "folded max folded",
        fn: () => max(examples.folded, examples.folded)
      },
      {
        name: "folded sub folded",
        fn: () => api.sub(examples.folded, examples.folded),
        expect: pretty(examples.folded)
      },
      {
        name: "gate max variant",
        fn: () => {
          const variant = clone(examples.gate);
          variant.strips[2] = [0.5, 1.1, 1.0, 0.25, 0.5, 0.65];
          return max(examples.gate, variant);
        }
      },
      {
        name: "gate min variant",
        fn: () => {
          const variant = clone(examples.gate);
          variant.strips[2] = [0.5, 1.1, 1.0, 0.25, 0.5, 0.65];
          return min(examples.gate, variant);
        }
      },
      {
        name: "gate max/min difference",
        fn: () => {
          const variant = clone(examples.gate);
          variant.strips[2] = [0.5, 1.1, 1.0, 0.25, 0.5, 0.65];
          const upper = max(examples.gate, variant);
          const lower = min(examples.gate, variant);
          return api.sub(upper, lower);
        }
      },
      {
        name: "width mismatch rejected",
        fn: () => max(examples.folded, examples.step),
        shouldThrow: /equal number of strips/i
      },
      {
        name: "mirror reverses strips",
        fn: () => mirror(examples.step),
        expectFn: value => pretty(value.strips[0]) === pretty(examples.step.strips[examples.step.strips.length - 1])
      },
      {
        name: "pad increases H symmetrically",
        fn: () => pad(examples.folded, 0.25, 0.5),
        expectFn: value => Math.abs(hsum(value.strips[0]) - 1.75) < 1e-6
      },
      {
        name: "repeat tiles widths",
        fn: () => repeat(examples.folded, 3),
        expectFn: value => value.widths.length === 3 && value.strips.length === 3
      },
      {
        name: "concat appends designs",
        fn: () => concat(examples.step, examples.step),
        expectFn: value => value.widths.length === examples.step.widths.length * 2 && value.strips.length === examples.step.strips.length * 2
      },
      {
        name: "offset adds folded margins",
        fn: () => offset(examples.step, [0.5, 0.5], 0.75),
        expectFn: value => value.widths.length === examples.step.widths.length + 3 && pretty(value.strips[0]) === pretty([2, 2])
      },
      {
        name: "offset preserves negative-width sugar for overlap",
        fn: () => concat(examples.saw, offset(mirror(examples.saw), -2, 0)),
        expectFn: value => Math.abs(sum(value.widths) - (sum(examples.saw.widths) * 2 - 2)) < 1e-6 && !validate(value)
      },
      {
        name: "normalizeSugaredDesign merges overlapped folded spans",
        fn: () => normalizeSugaredDesign({
          widths: [2, -1, 1],
          strips: [[2, 2], [2, 2], [2, 2]]
        }),
        expectFn: value => value.widths.length === 2 && Math.abs(sum(value.widths) - 2) < 1e-6 && !validate(value)
      },
      {
        name: "blend endpoints stay valid",
        fn: () => {
          const variant = clone(examples.gate);
          variant.strips[2] = [0.5, 1.1, 1.0, 0.25, 0.5, 0.65];
          return blend(examples.gate, variant, 0.35);
        }
      },
      {
        name: "clamp keeps design between envelopes",
        fn: () => {
          const variant = clone(examples.gate);
          variant.strips[2] = [0.5, 1.1, 1.0, 0.25, 0.5, 0.65];
          const lo = min(examples.gate, variant);
          const hi = max(examples.gate, variant);
          return clamp(blend(lo, hi, 0.4), lo, hi);
        }
      },
      {
        name: "recursiveCornerCubes validates",
        fn: () => recursiveCornerCubes({ levels: 4, paperWidth: 2, H: 2 }),
        expectFn: value => value.widths.length > 0 && !validate(value)
      },
      {
        name: "sampledSphere validates",
        fn: () => sampledSphere({ xCount: 9, zCount: 8 }),
        expectFn: value => value.widths.length === 9 && !validate(value)
      },
      {
        name: "subdividedSphere validates",
        fn: () => subdividedSphere({ minSpacing: 1, paperWidth: 10, H: 10 }),
        expectFn: value => value.widths.length === 16 && !validate(value)
      },
      {
        name: "progressiveSubdividedSphere validates",
        fn: () => progressiveSubdividedSphere({ minSpacing: 1, paperWidth: 10, H: 10 }),
        expectFn: value => value.widths.length === 16 && !validate(value)
      },
      {
        name: "interleavedSampledSphere validates",
        fn: () => interleavedSampledSphere({ xCount: 12, zCount: 10 }),
        expectFn: value => value.widths.length === 23 && !validate(value)
      },
      {
        name: "sampledCone validates",
        fn: () => sampledCone({ xCount: 9, zCount: 8 }),
        expectFn: value => value.widths.length === 9 && !validate(value)
      },
      {
        name: "sampledRidge validates",
        fn: () => sampledRidge({ xCount: 9, zCount: 8 }),
        expectFn: value => value.widths.length === 9 && !validate(value)
      }
    ];
  }

  function runPopupOperatorTests(options = {}) {
    const log = !!options.log;
    const api = window.POPUP_TEST_API;
    if (!api) throw Error("POPUP_TEST_API is not available.");
    const cases = popupOperatorTestCases(api);
    const results = [];
    for (const test of cases) {
      try {
        const value = test.fn();
        const err = api.validate(value);
        if (err) throw Error(err);
        if (test.shouldThrow) throw Error(`Expected error ${test.shouldThrow}, but test succeeded.`);
        if (test.expect && api.pretty(value) !== test.expect) {
          throw Error(`Expected ${test.expect}, got ${api.pretty(value)}`);
        }
        if (test.expectFn && !test.expectFn(value)) throw Error("Expectation function returned false.");
        results.push({ name: test.name, ok: true, value });
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        if (test.shouldThrow && test.shouldThrow.test(message)) {
          results.push({ name: test.name, ok: true, expectedError: message });
        } else {
          results.push({ name: test.name, ok: false, error: message });
        }
      }
    }
    if (log && console.table) {
      console.table(results.map(r => ({
        name: r.name,
        ok: r.ok,
        detail: r.error || r.expectedError || "ok"
      })));
    }
    return results;
  }

  window.popupOperatorTestCases = popupOperatorTestCases;
  window.runPopupOperatorTests = runPopupOperatorTests;
})();
