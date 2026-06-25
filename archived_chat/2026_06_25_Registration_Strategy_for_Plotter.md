---
title: "Registration Strategy for Plotter"
source: "ChatGPT conversation JSON"
exported_at_utc: "2026-06-25T15:31:49Z"
---

# Registration Strategy for Plotter

## User

> _User (created=2026-06-23T10:06:55Z, id=0a31faad-5e82-4f66-af1e-c3162b2ff739)_

Okay, I've got a general problem here to think about. As you know, I've been creating code that can make designs that will be printable or drawable slash cuttable from within my cutter plotter. And what I want to think about now is how I might sensibly approach registration. Specifically, what I mean is, I think the results I'll be creating may need to be, well, multiple passes. So possibly a pen pass which draws something, and then some cutting pass or passes which cut the strip cuts, and then possibly another cut pass which uses a different force or pressure setting so that it simply very lightly scores, so giving me time maybe even to swap out the item in the pen holder or blade holder so that it's a scoring item instead of cutting. Then the biggest registration problem is the potential of turning the paper over, or paper or card over, and doing another pass of scoring from that side. I think this will be very, very important for making the whole, these elaborate pop-up structures be actually comfortable for folding. I think they'll be difficult to fold, otherwise they'll require quite a lot of manual skill. But with the scoring and cutting done well and registered properly, then I think it might be easier. And as a final sort of stretch thought, it's even possible that I might want to use my 3D printer for printing a structure that is the same resulting sort of staircase 3D structure so that it could act as a support for the folded popped-up card, maybe even two of those complementary, so that the card can be rapidly pressed into the right 90 degrees configuration. But again, that requires registration. So yeah, so this would be just introducing the subject. Please let me know your thoughts.

---

## Assistant

> _Assistant (created=2026-06-23T10:07:03Z, id=b04fd00e-bcc3-4e63-9c80-b7c9079688d8)_

I’ll treat this as a systems/design problem rather than just “add fiducials”: the key is to separate coordinate calibration, media reloading repeatability, tool-change repeatability, and front/back flip ambiguity.

---

## Assistant

> _Assistant (created=2026-06-23T10:07:03Z, id=2408e9b2-8e12-4b2f-bafb-46387c436621)_

Yes — this is exactly the point where “drawing geometry” becomes “process engineering”. The design data may be mathematically perfect, but the physical workflow introduces offsets, rotation, scale error, slip, blade/pen offsets, paper stretch, front/back mirroring, and tool-specific behaviour.

I would think about registration in **layers**, from easiest/most reliable to most ambitious.

## 1. Prefer “don’t unload the sheet” whenever possible

For same-side multi-pass work — pen, cut, score, heavier cut — the best registration strategy is:

**Load the sheet once. Do all operations before unloading.**

That avoids the biggest error source: re-feeding the material. Tool changes are much easier to control than media reloads, because the carriage coordinate system remains live.

A sensible pass order might be:

1. pen drawing / annotation / fold labels
2. light scoring pass
3. cut pass
4. optional final through-cut pass or perforation pass

For your KH-720, this implies your software should generate a **job bundle**, not just one path. The bundle would contain multiple operation layers:

```text
Layer 1: pen draw
Layer 2: mountain score
Layer 3: valley score
Layer 4: cut
Layer 5: registration marks / diagnostic marks
```

Then your sender pauses between layers:

```text
Insert pen, press continue.
Insert scoring tool, press continue.
Insert blade, press continue.
```

The crucial thing is that the plotter does not lose its origin between pauses.

## 2. Build every job around a physical registration frame

I would add a sacrificial “registration frame” to every sheet. Not just visual marks, but a defined coordinate structure outside the useful artwork.

For example:

```text
+--------------------------------------------------+
|  fiducial A                         fiducial B   |
|                                                  |
|        actual pop-up / kirigami geometry          |
|                                                  |
|  fiducial C                         fiducial D   |
+--------------------------------------------------+
```

But I’d make the marks useful in several ways:

- **Drawn crosshairs** for visual inspection.
- **Small cut holes or nicks** for physical alignment.
- **Corner L marks** so rotation/skew is obvious.
- **Operation labels**: “front”, “back”, “top feed edge”, etc.
- **A test mini-pattern** showing whether scoring/cutting lines are aligned.

For example, each pass could include a tiny diagnostic stack like:

```text
pen line:      ─────────────
score line:        ─────────────
cut nick:              |
```

If those line up incorrectly, you immediately know whether the offset is in X, Y, rotation, or tool compensation.

## 3. Treat front/back scoring as a separate, harder problem

Turning the sheet over is the hard part. Once you flip the media, the coordinate system is mirrored. You need a deliberate convention.

Suppose your front-side design coordinates are:

```text
x rightwards, y upwards
```

If you flip the sheet left-to-right, then the back-side coordinates become:

```text
x_back = sheet_width - x_front
y_back = y_front
```

If you flip top-to-bottom:

```text
x_back = x_front
y_back = sheet_height - y_front
```

If you rotate 180° instead of mirror-flipping:

```text
x_back = sheet_width - x_front
y_back = sheet_height - y_front
```

These are not interchangeable. So your workflow should physically enforce one flip operation.

For instance:

```text
Always flip around the left edge.
Never rotate the sheet.
Feed the same physical edge into the plotter.
```

or:

```text
Always rotate the sheet 180 degrees.
Feed the opposite edge into the plotter.
```

I would literally print/cut labels on the margin:

```text
FRONT SIDE
FEED THIS EDGE FIRST
AFTER FRONT PASS: FLIP OVER LEFT-TO-RIGHT
BACK SIDE SHOULD SHOW THIS CORNER MARK HERE
```

That sounds fussy, but it saves enormous ambiguity.

## 4. Use asymmetric fiducials, not symmetric ones

A classic mistake is using four identical marks. They confirm alignment, but they do not tell you whether the sheet is mirrored, rotated, or upside-down.

Use asymmetric marks. For example:

```text
A = cross in circle
B = cross in square
C = triangle
D = double-circle
```

Or simpler:

```text
Top-left:     +
Top-right:    ++
Bottom-left:  +++
Bottom-right: ++++
```

Then your generated back-side job can include expected “ghost” positions for those fiducials. You can quickly see whether the physical flip matches the software transform.

## 5. Separate registration types

There are several different errors hiding under the word “registration”. I’d explicitly model them:

### A. Tool offset

The pen tip, blade tip, scoring stylus, and any custom tool may not sit at exactly the same XY point in the holder.

You can calibrate this by drawing/cutting a small shared pattern:

```text
pen:   draw crosshair
blade: cut tiny crosshair
score: score line through it
```

Then measure the offset and store per-tool corrections:

```json
{
  "tools": {
    "pen_bic": { "dx": 0.00, "dy": 0.00 },
    "blade_45": { "dx": -0.18, "dy": 0.07 },
    "score_ball": { "dx": 0.11, "dy": -0.04 }
  }
}
```

Your path generator can then apply:

```text
x_tool = x_design + dx_tool
y_tool = y_design + dy_tool
```

This is likely very worthwhile.

### B. Media origin offset

This is the offset caused by loading the paper/card in a slightly different place.

For single-load multi-pass jobs, you mostly avoid this.

For front/back jobs, this becomes important.

### C. Rotation/skew

If the sheet is not perfectly square to the rollers, the error grows across the page. A 0.2° skew can be quite visible on A4-sized geometry.

This is why two fiducials along the feed edge are better than one origin mark. One point gives translation; two points give translation plus rotation.

### D. Scale error

The cutter’s nominal “1000 units = 1 inch” may be slightly different in X and Y. Also, grit rollers can introduce different behaviour in feed direction versus carriage direction.

You can calibrate this with a large rectangle:

```text
commanded:  180.000 mm × 240.000 mm
measured:   179.65 mm × 240.42 mm
```

Then store scale corrections.

### E. Material deformation

Paper/card stretches, compresses, bends, and slips. Thick corrugated card is especially awkward. Registration may be good near the pinch rollers and worse elsewhere.

This argues for keeping important registration features near the actual work area, not only at distant corners.

## 6. A practical registration workflow for your cutter plotter

I’d start with a deliberately modest process.

### Phase 1: same-side multi-pass registration

Goal: pen + score + cut on the same side without unloading.

Create a test file containing:

- outer rectangle
- four asymmetric fiducials
- several pen/score/cut alignment tests
- a simple one-step pop-up
- labels showing intended operation order

Workflow:

```text
1. Load A4/card.
2. Home plotter.
3. Draw fiducials and labels with pen.
4. Pause.
5. Replace pen with scorer.
6. Score fold lines.
7. Pause.
8. Replace scorer with blade.
9. Cut slit lines.
10. Unload and inspect.
```

This tests tool-change repeatability and per-tool offset.

### Phase 2: front/back flip registration

Goal: score one fold direction from the front and the opposite fold direction from the back.

Workflow:

```text
1. Front side: draw fiducials, score/cut some geometry.
2. Unload.
3. Flip according to a fixed rule.
4. Reload against a physical edge stop.
5. Back side: draw/check fiducials lightly, then score.
```

The important addition here is a **physical loading fixture**.

## 7. Make a simple loading jig

For front/back operations, I’d strongly consider a carrier sheet or registration board.

Something like:

```text
+----------------------------------------+
| fixed left stop                        |
| |                                      |
| |   A4/card taped or lightly clipped   |
| |                                      |
| +--------------------------------------+
| fixed bottom/feed-edge stop            |
+----------------------------------------+
```

The idea is that the card is always positioned relative to a rigid carrier, and the carrier is what the plotter grips.

Options:

- low-tack cutting mat
- thin card carrier with printed alignment marks
- acetate/Mylar carrier
- taped hinge along one edge
- 3D printed corner stops attached to a carrier board
- punched holes over registration pins

For your use, I particularly like the idea of a **hinged flip carrier**:

```text
Front pass:
  card is taped along one edge to carrier

Flip:
  card folds over like a book page around the tape hinge

Back pass:
  the same hinge edge preserves one registration axis
```

This could be very effective for back-side scoring, because the flip axis is physically defined rather than guessed.

## 8. Registration holes may be better than printed fiducials

If the cutter can make small holes or V-notches in the waste margin, those can become mechanical references.

For example:

```text
o------------------------------△
|                              |
|          work area            |
|                              |
□------------------------------x
```

You could cut/punch two small round holes in the margin and place the sheet onto pins in a carrier for the reverse pass.

The classic high-precision method is:

```text
two registration pins
two matching holes
```

One round hole fixes X/Y. A second slotted hole fixes rotation without over-constraining the sheet.

That is:

```text
round hole:  constrains X and Y
slot hole:   constrains rotation but tolerates small expansion
```

This is used all over fabrication because it avoids fighting material tolerances.

## 9. Software representation: add transforms, not ad hoc mirrored geometry

Your design model should probably distinguish:

```text
design geometry
operation layer
tool correction
side transform
machine transform
```

Conceptually:

```text
machine_point =
    machine_calibration(
        media_registration(
            side_transform(
                tool_offset(
                    design_point
                )
            )
        )
    )
```

You do not need to implement it that grandly at first, but keeping those concepts separate will prevent confusion.

For a front-side pass:

```text
P_machine = T_machine · T_origin · T_tool · P_design
```

For a back-side pass:

```text
P_machine = T_machine · T_origin · T_flip · T_tool · P_design
```

Where `T_flip` is one of the known mirror/rotation transforms.

This would let you generate front and back passes from the same source geometry rather than manually duplicating and mirroring things.

## 10. Mountain and valley folds map nicely to front/back scoring

For pop-ups, scoring direction matters. A score weakens the material on one side, making it preferentially fold toward or away from that side depending on the material and score geometry.

So your design language could mark fold lines as:

```json
{
  "type": "fold",
  "direction": "mountain",
  "score_side": "front"
}
```

and:

```json
{
  "type": "fold",
  "direction": "valley",
  "score_side": "back"
}
```

Or more explicitly:

```json
{
  "operation": "score",
  "side": "front",
  "fold_role": "mountain"
}
```

Then the generator decides which pass gets which geometry.

This is important because you do not want “back-side score geometry” to be a separate hand-maintained drawing. It should be derived from the fold semantics.

## 11. The 3D-printed folding former idea is very promising

Your stretch thought is a good one. For elaborate pop-up structures, a scored/cut sheet may still have many degrees of freedom. A former could collapse that ambiguity.

I’d imagine two different kinds.

### A. Single-sided support former

A 3D printed “staircase” shape that the card is pressed against:

```text
paper/card
   ↓
  /|_/|_/|_/|     printed staircase former
```

This helps folds find the correct final angles.

### B. Matched male/female press tool

Two complementary forms:

```text
upper former:     _|¯|_|¯|_
card:             flat scored/cut sheet
lower former:     ¯|_|¯|_|¯
```

Press together gently, and the folds are encouraged into the correct mountain/valley structure.

That could be especially powerful for repeated production.

But it introduces its own registration problem: the card must align with the former. You can solve that with the same registration margin idea:

- printed former has pins
- card has registration holes
- holes are cut in the plotter pass
- card drops onto former before pressing

This is probably the cleanest connection between the cutter and 3D printer workflows.

## 12. A very sensible near-term experiment

I would not begin with the full elaborate pop-up. I’d make a calibration artifact.

Something like:

```text
A4 sheet with:
- asymmetric fiducials
- two registration holes
- simple single-step pop-up
- one front score
- one back score
- one cut line
- one pen line
- diagnostic alignment combs
```

The artifact should answer these questions:

1. Can I do pen → score → cut without unloading?
2. How much offset does each tool introduce?
3. Can I unload, flip, reload, and hit the back-side score within acceptable error?
4. Does back-side scoring materially improve fold comfort?
5. Do registration holes/pins improve repeatability enough?
6. Does a 3D printed former make folding reliable?

## 13. The likely winning architecture

For your pop-up system, I’d aim for this eventually:

```text
source design
   ↓
semantic geometry:
   cuts
   mountain folds
   valley folds
   visible drawing
   registration features
   former geometry
   ↓
operation planner:
   front pen
   front score
   front cut
   back score
   former STL/export
   ↓
machine-specific generator:
   KH-720 command streams
   tool offsets
   side transforms
   feed margin
   calibration correction
```

The powerful thing is that the same source data could generate:

- front-side drawing
- front-side score/cut
- back-side mirrored score
- registration holes
- diagnostic alignment marks
- 3D printed folding former
- maybe even assembly instructions

That is the right direction: one design model, many manufacturing views.

## My practical recommendation

Start with **same-load multi-pass registration** before attempting front/back scoring. Add asymmetric fiducials and a tiny diagnostic alignment pattern to every output. Then add a physical carrier or pin-registration system before doing serious reverse-side work.

For the 3D printed former, I’d keep it in mind now and design registration holes from the beginning. Even if you do not print the former yet, the holes/marks can later become the shared coordinate system between plotter output and printed tooling.
