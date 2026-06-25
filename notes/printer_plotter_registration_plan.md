# Printer to Plotter Registration Plan

Sources:
- `archived_chat/2026_06_25_Registration_Strategy_for_Plotter.md`
- `archived_chat/2026_06_25_Registration_Strategy_for_Plotter.json`
- `archived_chat/CUTTINGPLOTTER-M_1756969204497.pdf`
- summary: `notes/plotter_manual_summary.md`

Goal:
- print an image on the Canon PIXMA MG2250S
- move that printed sheet into the cutter plotter
- optionally draw design marks
- score valleys
- flip the sheet and score mountains from the reverse side using `Flip X`
- flip back and cut

This document is a process plan, not yet the final machine implementation.

Machine scope:
- this workflow is specifically for the `KH` model cutter plotter
- KH panel terminology should be used consistently:
  - `Option` for entering/leaving offline mode
  - `Move` for test / accept behavior
  - `Origin` for setting the job origin
  - `Up` / `Down` arrows for feed movement in offline mode and speed adjustment on the main screen
  - `Left` / `Right` arrows for carriage movement in offline mode and force adjustment on the main screen

## Executive View

The workflow should be built in four layers:
1. calibrate each device independently
2. define one physical registration convention for the sheet
3. define one repeatable multi-pass operator workflow
4. add acceptance checks after each stage so misalignment is caught early

The biggest risks are:
- printer image placement drift
- plotter feed skew
- tool-to-tool XY offset
- ambiguous front/back flipping
- loss of origin between passes
- deformation of paper/card after printing or scoring

## Required Product/Software Changes

These are the app changes implied by the desired process:
- rename the current plotter `Flip Y` option to `Flip X`
- make sure reverse-side mountain scoring uses the chosen physical flip convention
- support job bundles or at least a documented pass sequence:
  - draw marks
  - valleys
  - mountains with reverse-side transform
  - cuts
- support registration features as first-class generated geometry:
  - printed fiducials
  - plotted diagnostic marks
  - optional registration holes / slot
  - operator labels in the waste margin

## Chosen Physical Convention

Use one convention and never improvise:

- front-side print orientation is the master reference
- define a single `feed edge`
- define the `x=0` side on the printed sheet
- for reverse-side scoring, flip around the vertical left edge like turning a book page
- keep the same physical feed edge entering the plotter after the flip

This matches the earlier registration strategy and makes a future `Flip X` transform the right conceptual tool.

Margin labels should state:
- `FRONT`
- `FEED EDGE`
- `X=0 SIDE`
- `FLIP ABOUT LEFT EDGE FOR BACK SCORE`

## Registration Strategy

Use both visual and mechanical registration:

### Visual

- four asymmetric fiducials in the waste margin
- an `L` corner mark near the feed edge
- a small alignment comb showing draw / score / cut coincidence
- text labels for orientation

### Mechanical

Plan to add:
- one round registration hole
- one slotted registration hole

The round hole fixes XY.
The slot fixes rotation without over-constraining media expansion.

This should be near-term, not just future aspiration, because it connects:
- front/back scoring
- potential carrier jig
- possible 3D-printed folding former

## Recommended Hardware Process

### Phase 0: Build a sacrificial calibration sheet

Before doing real popup art, make a dedicated calibration design containing:
- outer board edge
- asymmetric fiducials
- two registration holes near the waste margin
- one pen line
- one valley score line
- one mountain score line
- one cut line
- one diagnostic alignment comb
- one simple popup element

Success criterion:
- the sheet tells you whether each pass type is aligned before you commit to real designs

### Phase 1: Printer-only calibration

Objective:
- determine how consistently the Canon places a printed image on the sheet

Procedure:
1. print the calibration page with fiducials and border only
2. print the same page 3 times on the same stock
3. measure:
   - left margin to printed border
   - top margin to printed border
   - width and height of printed border
   - skew relative to paper edges
4. record spread across the three sheets

Acceptance:
- placement repeatability should be stable enough that registration marks land within your planned tolerance
- if not, reduce ambition and use larger margins and coarser artwork until process improves

Record:
- chosen Canon media type setting
- chosen quality setting
- whether borderless printing is off
- whether scaling is exactly `100%`
- measured print offset and any X/Y scale discrepancy

Important rule:
- do not allow printer driver “fit to page” or automatic scaling

### Phase 2: KH plotter-only calibration

Objective:
- establish stable blade, pen, and scoring settings independently of printing

Subtasks:

#### 2A. Feed and skew test

Use plain sacrificial media and plot:
- long border rectangle
- long parallel lines near left and right

Check:
- does the sheet track squarely
- do lines remain parallel to sheet edges

If not:
- inspect pinch roller symmetry
- keep pinch rollers over valid roller zones only
- use balanced pressure and consistent side margins

#### 2B. Tool setting test

For each tool:
- pen
- scoring tool
- blade

Run a small test matrix varying:
- speed
- force

Manual-derived starting point:
- blade speed start near `300 mm/s`
- force start near `100 g`
- for delicate popup work, prefer slower over faster until proven stable

Check:
- pen: line quality, no dragging
- scorer: visible controllable score, no tearing through
- blade: cuts face stock cleanly without destroying backing/support

#### 2C. Tool offset test

Using the same loaded sheet:
1. pen draws a crosshair
2. scoring tool scores through it
3. blade makes a tiny cut nick through it
4. inspect under magnification if possible

Record offsets as:

```json
{
  "pen": {"dx": 0, "dy": 0},
  "score": {"dx": 0, "dy": 0},
  "blade": {"dx": 0, "dy": 0}
}
```

Success criterion:
- you can quantify per-tool XY differences and later compensate in software

### Phase 3: Single-load multi-pass KH plotter workflow

Objective:
- prove that pen, score, and cut can all align on the same side without unloading

Pass order:
1. optional pen marks
2. valley score
3. cut

Operator flow:
1. load sheet
2. press `Option` to enter offline mode
3. position media with `Up` / `Down`
4. position carriage with `Left` / `Right`
5. press `Origin` to set origin
6. run optional pen layer
7. inspect diagnostic marks
8. swap to scorer
9. run valley layer
10. inspect diagnostic marks
11. swap to blade
12. run cut layer
13. inspect full result

Acceptance after each pass:
- fiducial overlay still looks correct
- no cumulative drift visible in the diagnostic comb
- no sheet slip from tool pressure

If pass alignment fails:
- stop, do not continue to the next tool
- classify error as:
  - uniform XY offset
  - rotation/skew
  - local distortion
  - force-induced drag

### Phase 4: Reverse-side mountain scoring

Objective:
- prove that reverse-side score alignment is controllable

Procedure:
1. complete front-side print and front-side plotter operations
2. unload carefully
3. flip sheet around the defined left edge
4. reload with the same feed edge convention
5. use `Flip X` in the app
6. run reverse-side mountain score pass only
7. inspect alignment against:
   - fiducials
   - registration holes/pins
   - diagnostic back-score markers

Critical note:
- do not combine reverse-side scoring with cutting on the first trials
- reverse-side scoring needs to stand alone first

Acceptance:
- back score lands consistently relative to front-side printed and plotted references
- fold behavior materially improves

If it fails:
- distinguish between:
  - wrong flip transform
  - wrong feed-edge convention
  - reload variability
  - print-to-plot mismatch

### Phase 5: Full intended production workflow

Target operator sequence:

1. print image + registration frame on Canon
2. load sheet into the KH plotter
3. optional pen pass:
   - `Send Edge`
   - `Send Cuts`
   - `Send Valleys`
   - `Send Mountains`
   only if using a visible-marking tool and if these marks are genuinely useful
4. install scoring tool
5. run `Send Valleys`
6. unload sheet
7. flip sheet around the left edge
8. reload sheet with same feed-edge convention
9. enable `Flip X`
10. run `Send Mountains`
11. unload sheet
12. flip back to front orientation
13. reload sheet
14. install blade
15. disable flip
16. run `Send Cuts`

Important refinement:
- this is the eventual workflow
- but you should only trust it after Phases 1-4 have been demonstrated on test sheets

## Jig / Fixture Plan

The strongest near-term improvement is a carrier or pin-based jig.

Recommended order:

### Minimum jig

- printed base board
- corner stop for the feed edge and one side
- marked positions for the sheet

### Better jig

- low-tack carrier sheet or mat
- tape hinge on the left edge

### Best likely jig for this project

- one round pin + one slotted pin on a carrier board
- matching holes in the sheet’s waste margin
- optional hinge assistance on the left edge

Why this is attractive:
- supports reverse-side scoring
- supports future former pressing
- gives a persistent physical coordinate system

## What To Record

Create and maintain a calibration record with:

### Printer

- stock type
- printer settings
- measured X/Y print offset
- measured X/Y scale error
- skew observations

### Plotter

- KH panel context
- tool type
- tool holder used
- blade exposure
- speed
- force
- compensation/offset setting
- measured XY offset vs pen reference

### Process

- feed edge convention
- flip convention
- registration hole geometry
- whether `Flip X` was enabled
- observed result quality

## Acceptance Gates

Do not move on if the current gate is failing.

### Gate A: printer repeatability

Pass if:
- repeated prints land close enough to be worth registering to

### Gate B: plotter same-side repeatability

Pass if:
- pen, score, and cut align acceptably without unloading

### Gate C: front/back transform correctness

Pass if:
- reverse-side score lands in the correct mirrored place

### Gate D: front/back reload repeatability

Pass if:
- repeated flip/reload attempts give consistent back-side score placement

### Gate E: production viability

Pass if:
- the full sequence produces a foldable popup reliably enough to repeat

## Failure Diagnosis Table

### Problem: everything is shifted by about the same amount

Likely causes:
- wrong origin
- printer offset not compensated
- tool offset not compensated

Action:
- re-check origin and tool offset calibration

### Problem: alignment is good near origin, poor far away

Likely causes:
- skew
- unequal pinch pressure
- reload rotation
- print scaling error

Action:
- inspect roller setup, feed angle, and print scale

### Problem: reverse-side score is mirrored the wrong way

Likely causes:
- wrong transform
- wrong physical flip

Action:
- verify that the physical process is specifically `Flip X` about the left edge

### Problem: cut pass drags the sheet or distorts score alignment

Likely causes:
- too much blade exposure
- too much force
- stock unsupported

Action:
- reduce blade protrusion first, then force, then speed

## Recommended Immediate Next Steps

1. Change app terminology/behavior from `Flip Y` to `Flip X` for the reverse-side score workflow.
2. Add registration-frame generation to the popup app.
3. Add optional registration holes:
   - one round
   - one slotted
4. Add a dedicated calibration test design in the popup app.
5. Run printer-only repeatability tests.
6. Run plotter-only tool and skew tests.
7. Only then attempt the full print -> valley -> flip -> mountain -> cut pipeline.

## Future Desirable Automation

- app-level tool profiles with stored offsets and force/speed defaults
- saved media profiles for specific paper/card stocks
- a guided “job bundle” workflow with operator prompts between tools
- reverse-side preview that explicitly shows the chosen flip convention
- optional generation of a matching 3D-printed folding former using the same registration holes
