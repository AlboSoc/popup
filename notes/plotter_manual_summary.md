# KH Cutter Plotter Manual Summary

Source:
- `archived_chat/CUTTINGPLOTTER-M_1756969204497.pdf`

Scope:
- Practical notes extracted for registration, loading, tool setup, and repeatable operation.
- This summary is intentionally `KH-model-only`.
- The PDF covers other models too, but those are excluded here unless the behavior is explicitly shared and also matches the KH panel and hardware description.
- This is not a full manual replacement.

## KH 720 Basics

For the `KH 720` series, the manual states:
- max feeding width: `720 mm`
- max cutting width: `615 mm`
- cutting thickness: `<= 1 mm`
- speed range: `20-800 mm/s`
- force range: `20-500 g`
- re-cutting accuracy: `+-0.1 mm`
- language format: `DMPL/HPGL`

Manual pages:
- specs: p.13

## KH Main Parts

The KH main-parts page names:
- cover for rail guide
- pinch roller kit
- roller for feeding paper
- carriage
- reset switch
- screen
- buttons
- blade clamp
- power connection
- fuse holder
- power switch
- USB port
- COM port

For the `720` family the manual also indicates `3` pinch rollers.

Manual pages:
- KH diagram: p.9
- pinch roller quantity note: p.15

## Included Tooling

The accessory list includes:
- blade(s)
- blade holder
- pen holder
- ball pen core
- USB cable
- COM cable

Manual page:
- accessories: p.14

## Safety / Handling

- Do not drag the carriage by hand.
- Wait about `5 seconds` after powering off before powering on again.
- Blade is sharp; handle the arbor/body, not the exposed tip.
- Use the supplied cable or an approved replacement.

Manual pages:
- safety: pp.3-6, p.8

## Blade Setup

The manual’s key guidance is:
- insert the blade into the holder
- adjust exposure according to material thickness
- exposed blade should be very small, approximately `1/64 inch`
- too much exposed blade is explicitly shown as incorrect

Interpretation for this workflow:
- the blade should not be doing the work by length alone
- use minimal blade protrusion, then increase force only as needed

Manual pages:
- blade assembly and exposure: pp.19-21

## KH Control Panel

The KH panel uses these physical buttons:
- `Reset`
- `Option`
- `Setup`
- `Move`
- `Origin`
- left arrow
- right arrow
- up arrow
- down arrow

Important:
- the manual text sometimes uses generic function labels such as `Offline/Leave/Option`, `Test/Move`, `V+/V-`, and `F+/F-`
- for actual KH operation, those should be interpreted using the KH panel labels above

## KH Control Functions

Main screen functions include:
- adjust cutting speed
- adjust cutting force
- run a small test pattern

KH button/function mapping from the manual:

### `Reset`

- stops the cutter
- sends the carriage arm to its rightmost machine origin

### `Option`

- enters offline mode from the main screen
- leaves offline mode without accepting position changes
- resumes any paused cutting when used as the leave/cancel action

This is the KH button corresponding to the manual’s generic `Offline/Leave/Option` wording.

### `Setup`

- enters setup mode from the main screen
- has no function in offline mode according to the manual

### `Move`

- from the main screen, runs the small test shape used to evaluate current speed and force
- in offline mode, accepts changed blade/material positions and resumes

This is the KH button corresponding to the manual’s generic `Test/Move` wording.

### `Origin`

- in offline mode, accepts the current location as the new origin and resumes
- the manual also notes z-axis drop / functionality testing behavior here

### `Up` and `Down` arrows

- on the main screen, these correspond to the manual’s speed-adjustment function
- in offline mode, they move the material using the feed rollers

### `Left` and `Right` arrows

- on the main screen, these correspond to the manual’s force-adjustment function
- in offline mode, they move the carriage left/right

Manual pages:
- main screen and controls: pp.22-25

## Recommended KH Starting Machine Settings From Manual

The manual suggests:
- `300 mm/s` as a reasonable default speed for many cuts
- lower speed for smaller/more detailed work
- `100 g` as a good starting force for determining material settings
- always run test cuts to determine actual settings for the material

Manual page:
- speed/force guidance: p.23

## Loading Material On KH 720

The manual’s basic loading guidance:
- release pinch rollers
- feed the material under the pinch rollers
- on the KH 720, aim for one pinch roller near each side of the media and one near the center when width allows
- do not place a pinch roller over a feed-roller gap
- leave roughly `1/2"` to `1 1/2"` margin from the roller edge to the media edge on both sides
- engage the pinch roller release levers after positioning

Interpretation for registration:
- pinch roller placement and symmetry matter
- asymmetric or inconsistent roller pressure can cause tracking error and skew

Manual pages:
- loading material: pp.26-28

## Setting The Job Origin On KH

The manual procedure, translated to KH controls, is:
1. press `Option` to enter offline mode
2. move the sheet with `Up` / `Down`
3. move the carriage with `Left` / `Right`
4. press `Origin` to define the starting point

This is critical for repeatability:
- every pass should use a deliberate origin-setting step
- any front/back workflow must specify exactly how origin is chosen relative to the sheet and registration frame

Manual pages:
- offline mode and setting origin: pp.24-28

## Troubleshooting Notes Relevant To KH Registration

### Paper deviation during cutting

The manual says paper deviation can occur if paper-press tension is inconsistent, and recommends making the two yellow copper nuts the same height so pressure is balanced.

Interpretation:
- if tracking drifts, inspect pinch roller pressure symmetry first

Manual page:
- p.39

### Small graphics cut poorly

The manual suggests:
- for `3-5 mm` letters: compensation `0.45`, speed `400 mm/s`
- for larger than `5 mm` letters: compensation `0.3`, speed `600 mm/s` or more

Interpretation:
- the machine/software expects blade compensation to matter
- for fine popup work, slower speeds are likely preferable at first

Manual page:
- p.39

### Repeated cutting / unwanted auto-feed

The manual recommends disabling automatic paper feeding after cutting in the software.

Interpretation:
- this is important for preserving sheet position between passes
- for your workflow, any software-side auto-feed/eject behavior should be turned off

Manual page:
- p.40

### Communication reliability

The manual advises not to use data conversion connectors/adapters because data loss can stop the cutting process.

Interpretation:
- prefer direct USB connection to the machine
- avoid hub/adapter complexity during calibration and registration tests

Manual page:
- p.40

## Consequences For The KH Popup Workflow

The manual strongly supports these operating rules:
- load once and do as many same-side passes as possible before unloading
- always run small test patterns before committing a whole sheet
- keep roller placement and pressure consistent
- set origin explicitly for every workflow stage using `Option`, the arrow keys, and `Origin`
- disable any software behavior that auto-feeds after a pass
- use direct USB where possible during calibration

## Open Items Not Covered Well By The KH Manual

The extracted manual does not provide a robust workflow for:
- precise front/back registration
- tool-to-tool XY offset calibration
- pen/scoring/blade swap repeatability
- mirrored reverse-side popup scoring
- printer-to-plotter alignment

Those need to be defined at the process level rather than assumed from the stock manual.
