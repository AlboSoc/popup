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
      Paper,
      applyBox,
      dropBox,
      dropBoxes,
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
        name: "Paper builds a folded base with paper metadata",
        fn: () => Paper(2, 5, 1.3),
        expectFn: value => value.widths.length === 1
          && pretty(value.strips[0]) === pretty([2, 2])
          && value._popupPaper
          && Math.abs(value._popupPaper.length - 2) < 1e-6
          && Math.abs(value._popupPaper.width - 5) < 1e-6
          && Math.abs(value._popupPaper.height - 1.3) < 1e-6
      },
      {
        name: "applyBox matches dropBox on the z=0-anchored special case",
        fn: () => {
          const viaApply = applyBox(Paper(2, 5, 1.3), 0, 1.1, 2, 0.75, 2.5);
          const viaDrop = dropBox(Paper(2, 5, 1.3), 1.1, 2, 0.75, 2.5);
          if (pretty(viaApply) !== pretty(viaDrop)) throw Error("applyBox did not match dropBox on the anchored special case.");
          return viaApply;
        },
        expectFn: value => pretty(value.widths) === pretty([2.5, 2, 0.5])
          && pretty(value.strips[1]) === pretty([0.9, 0.75, 1.1, 1.25])
          && !validate(value)
      },
      {
        name: "applyBox can add an interior z interval under monotonicity",
        fn: () => applyBox(Paper(2, 4, 0.8), 0.4, 1.2, 1.6, 0.5, 1.2),
        expectFn: value => pretty(value.widths) === pretty([1.2, 1.6, 1.2])
          && pretty(value.strips[1]) === pretty([0.8, 0.5, 1.2, 1.5])
          && !validate(value)
      },
      {
        name: "applyBox can subtract an interior z interval while preserving monotonicity",
        fn: () => {
          let model = applyBox(Paper(2, 4, 0.8), 0.4, 1.2, 1.6, 0.5, 1.2);
          return applyBox(model, 0.4, 1.2, 1.6, -0.3, 1.2);
        },
        expectFn: value => pretty(value.widths) === pretty([1.2, 1.6, 1.2])
          && pretty(value.strips[1]) === pretty([0.8, 0.2, 0.8, 0.3, 0.4, 1.5])
          && !validate(value)
      },
      {
        name: "negative floating applyBox stays localized instead of collapsing the whole shelf",
        fn: () => {
          const raised = applyBox(Paper(3, 4, 1.2), 0, 3, 2, 1, 1);
          const floating = applyBox(raised, 1, 2, 2, -1, 1);
          return floating;
        },
        expectFn: value => pretty(value.widths) === pretty([1, 2, 1])
          && pretty(value.strips[1]) === pretty([2, 1, 1, 2])
          && !validate(value)
      },
      {
        name: "applyBox can extend the paper to reach a z interval beyond the current length",
        fn: () => applyBox(Paper(2, 4, 0.8), 2.4, 3.1, 2, 0.8, 1),
        expectFn: value => pretty(value.widths) === pretty([1, 2, 1])
          && hsum(value.strips[0]) > 3.09
          && value._popupPaper
          && value._popupPaper.length > 3.09
          && !validate(value)
      },
      {
        name: "dropBox uses left-edge placement and raises the z=0-anchored footprint",
        fn: () => dropBox(Paper(2, 5, 1.3), 1.1, 2, 0.75, 2.5),
        expectFn: value => value.widths.length === 3
          && pretty(value.widths) === pretty([2.5, 2, 0.5])
          && pretty(value.strips[1]) === pretty([0.9, 0.75, 1.1, 1.25])
          && !validate(value)
      },
      {
        name: "dropBox stacks when repeated on the same footprint",
        fn: () => {
          let model = Paper(2, 5, 1.3);
          model = dropBox(model, 1.1, 2, 0.75, 2.5);
          return dropBox(model, 1.1, 2, 0.75, 2.5);
        },
        expectFn: value => pretty(value.widths) === pretty([2.5, 2, 0.5])
          && pretty(value.strips[1]) === pretty([0.9, 1.5, 1.1, 0.5])
          && !validate(value)
      },
      {
        name: "dropBox can reconstruct the built-in step example",
        fn: () => dropBox(Paper(2, 4, 0.9), 1.15, 1.6, 0.9, 1.2),
        expectFn: value => pretty(value) === pretty(examples.step)
      },
      {
        name: "negative-height dropBox subtracts from an existing raised footprint",
        fn: () => {
          let model = dropBox(Paper(2, 4, 0.9), 1.15, 1.6, 0.9, 1.2);
          return dropBox(model, 1.15, 1.6, -0.4, 1.2);
        },
        expectFn: value => pretty(value.widths) === pretty([1.2, 1.6, 1.2])
          && pretty(value.strips[1]) === pretty([0.85, 0.5, 1.15, 1.5])
          && !validate(value)
      },
      {
        name: "negative-height dropBox clips instead of breaking strip monotonicity",
        fn: () => {
          let model = dropBox(Paper(2, 4, 0.9), 1.15, 1.6, 0.9, 1.2);
          return dropBox(model, 1.15, 1.6, -2, 1.2);
        },
        expectFn: value => pretty(value.widths) === pretty([1.2, 1.6, 1.2])
          && pretty(value.strips[1]) === pretty([2, 2])
          && !validate(value)
      },
      {
        name: "dropBox grows the paper when additive stacking needs more height",
        fn: () => {
          let model = Paper(2, 4, 0.8);
          model = dropBox(model, 1.2, 2, 0.8, 1);
          model = dropBox(model, 1.2, 2, 0.8, 1);
          return dropBox(model, 1.2, 2, 0.8, 1);
        },
        expectFn: value => pretty(value.widths) === pretty([1, 2, 1])
          && pretty(value.strips[1]) === pretty([1.2, 2.4, 1.2])
          && hsum(value.strips[0]) > 2.39
          && value._popupPaper
          && value._popupPaper.length > 2.39
          && value._popupPaper.height > 2.39
          && !validate(value)
      },
      {
        name: "dropBox composes repeatedly on shared paper",
        fn: () => {
          let model = Paper(2, 6, 1.4);
          model = dropBox(model, 0.8, 1.2, 0.5, 1.2);
          model = dropBox(model, 1.1, 1.6, 0.9, 3);
          return dropBox(model, 0.7, 1.0, 0.4, 4.8);
        },
        expectFn: value => Math.abs(sum(value.widths) - 6) < 1e-6
          && value.strips.filter(strip => pretty(strip) !== pretty([2, 2])).length >= 2
          && !validate(value)
      },
      {
        name: "dropBox preserves an earlier box when a later disjoint box is added",
        fn: () => {
          let model = Paper(2, 6, 1.3);
          model = dropBox(model, 1.2, 1.6, 0.9, 3.0);
          return dropBox(model, 0.7, 1.0, 0.45, 4.8);
        },
        expectFn: value => pretty(value.widths) === pretty([3, 1.6, 0.2, 1.0, 0.2])
          && pretty(value.strips[1]) === pretty([0.8, 0.9, 1.2, 1.1])
          && pretty(value.strips[3]) === pretty([1.3, 0.45, 0.7, 1.55])
          && !validate(value)
      },
      {
        name: "dropBoxes matches chained dropBox calls",
        fn: () => {
          const chained = (() => {
            let model = Paper(2, 6, 1.3);
            model = dropBox(model, 0.8, 1.2, 0.55, 1.2);
            model = dropBox(model, 1.2, 1.6, 0.9, 3.0);
            model = dropBox(model, 0.7, 1.0, 0.45, 4.8);
            return model;
          })();
          const reduced = dropBoxes(Paper(2, 6, 1.3), [
            [0.8, 1.2, 0.55, 1.2],
            [1.2, 1.6, 0.9, 3.0],
            [0.7, 1.0, 0.45, 4.8]
          ]);
          if (pretty(chained) !== pretty(reduced)) throw Error("dropBoxes result did not match chained dropBox calls.");
          return reduced;
        },
        expectFn: value => Math.abs(sum(value.widths) - 6) < 1e-6
      },
      {
        name: "dropBoxes accepts object specs as well as tuples",
        fn: () => {
          const tupled = dropBoxes(Paper(2, 6, 1.3), [
            [0.8, 1.2, 0.55, 1.2],
            [1.2, 1.6, 0.9, 3.0],
            [0.7, 1.0, 0.45, 4.8]
          ]);
          const objected = dropBoxes(Paper(2, 6, 1.3), [
            { l: 0.8, w: 1.2, h: 0.55, p: 1.2 },
            { length: 1.2, width: 1.6, height: 0.9, position: 3.0 },
            { l: 0.7, w: 1.0, h: 0.45, p: 4.8 }
          ]);
          if (pretty(tupled) !== pretty(objected)) throw Error("Object-form dropBoxes specs did not match tuple-form specs.");
          return objected;
        },
        expectFn: value => Math.abs(sum(value.widths) - 6) < 1e-6
      },
      {
        name: "repeat duplicates a single dropped-box motif into two surviving boxes",
        fn: () => repeat(dropBox(Paper(2, 3, 0.9), 1.15, 1.6, 0.9, 1.2), 2),
        expectFn: value => pretty(value.widths) === pretty([1.2, 1.6, 0.2, 1.2, 1.6, 0.2])
          && pretty(value.strips[1]) === pretty([0.85, 0.9, 1.15, 1.1])
          && pretty(value.strips[4]) === pretty([0.85, 0.9, 1.15, 1.1])
          && !validate(value)
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
