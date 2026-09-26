# HOMUNCULUS — design plan

## The pitch

A sandbox where the fun comes from **asking "what happens if…" and getting a believable answer**.
The player is an alchemist with a clinical monitor. Every mixture is an experiment, the
homunculus is the instrument, and the monitor is the readout.

## Pillars

1. **Everything combines.** Any reagent can go with any other. Reactions come from aspects
   (fire, holy, radioactive…) rather than a hand-written table of pairs, so unplanned
   combinations still do something sensible.
2. **Consequences are physical.** Effects act through a body model (heart, lungs, brain,
   blood chemistry), so outcomes emerge: an opioid kills by stopping breathing, cyanide by
   blocking oxygen use, a giant by crushing its own bones.
3. **Observable at every depth.** Six anatomy layers, overlays, a hover inspector, live
   waveforms and per-system tabs: whatever changed, there is a view that shows it.
4. **The subject is a character.** It walks, talks, refuses, panics, dances and forgets.
   Behaviour is read off the same brain state the monitor shows.
5. **Real where it's cheap, fantastic where it's fun.** Real pharmacology, pH mixing,
   pulse-oximeter pitch, pupil signs and hypothermic brain protection sit next to
   lycanthropy, ghosts and antimatter.

## Core loop

```
pour reagents → set burner / stir / steep / treatments → brew
      ↑                                                   ↓
 learn (log, codex, tests)  ←  observe (chamber + monitor) ←  administer (route, dose, site)
                                          ↑
                              command the subject (walk, lift, solve…)
```

## Architecture

```
js/data   vocab.js ─┬─ substances.js   recipes.js   diseases.js   speech.js
          (contract)│
js/sim    mixer ────┘   pharmacology ── physiology ── diseases      behavior
          (brew)        (administer,     (fixed 0.1 s   (stages,     (commands,
                         doses)           step)          outcomes)    physics, speech)
js/render rig (pose → 3D joints → screen) · anatomy (6 layers) · scene (chamber, FX) · waves
js/ui     lab · monitor · chamber · codex · audio         js/main.js (loop, persistence)
```

- `js/sim` has no DOM access; the body runs headless in the tests.
- The simulation advances in fixed 0.1 s steps; rendering interpolates poses at frame rate.
- Game time is compressed: a drug's effect lasts tens of seconds, a disease a few minutes.

## Chemistry model

- **Concentration:** each effect in the mixture is the volume-weighted average of its
  ingredients, so dilution matters and dose size scales the result.
- **pH:** H⁺ and OH⁻ are summed by volume and netted, so acids and alkalis genuinely
  neutralise (and titration is as touchy as in real life).
- **Temperature:** the natural mix temperature is the volume-weighted average; the burner
  overrides it. Above 70 °C organic effects denature and pathogens die; above 120 °C cultures
  are sterile.
- **Stability:** blended toward the least stable ingredient. Explosion risk grows with
  instability, heat, vigorous stirring and electricity, and almost vanishes under magnetic
  containment. Antimatter explodes unless contained.
- **Reactions:** 24 aspect-driven rules (fire + ice cancel, light + shadow → invisibility,
  life + death → resurrection or undeath depending on which dominates, alcohol potentiates
  sedatives…).
- **Recipes:** 37 named results, each defined by a required ingredient set and optional
  process window. The most specific match wins. Recipes are discovered, never listed up front;
  the codex shows a riddle for each.

## Pharmacology

Each administration creates a *dose* with a depot and a plasma level:

```
moved   = depot · (1 − e^(−ka·dt))           ka depends on route (IV instant, oral slow)
plasma += moved · bioavailability
plasma *= e^(−ke·dt),  ke = ln2 / half-life · clearance(liver, kidneys) · (antidote boost)
effect intensity = Σ doses (magnitude × ml/10 × route multiplier × plasma)
```

Route rules: spinal ×2.2 and intracranial ×3 for nervous-system effects; splash and skin act
on the surface (burns, frost, holy water on undead, petrification by touch). Contact
temperature and pH damage the site on arrival; injecting gas or undissolved solids can
embolise; oral doses still in the stomach are lost when the subject vomits.

## Body model (per 0.1 s step)

1. Collect effect intensities from doses, disease stages, transformations and the environment.
2. Apply antagonisms (antidote, calm vs fear, purify vs undeath) and chaos modulation.
3. **Neuro:** 8 neurotransmitters approach effect-driven targets; nerve conductivity.
4. **Cardio:** target heart rate from stimulants, fear, pain, exertion, fever and
   compensation for low pressure or oxygen; rhythm risk (VF) from cardiotoxins, heavy
   stimulation, electricity, hypothermia and acidosis; MAP = heart function × rhythm × rate
   × blood volume × vascular tone.
5. **Respiratory:** brainstem drive depressed by sedatives and opioids; SpO₂ from
   ventilation × lung function × ambient O₂; tissue oxygen additionally limited by anaemia,
   perfusion and asphyxiants.
6. **Brain:** hypoxic injury below 55 % tissue oxygen (hippocampus most sensitive, halved when
   hypothermic); seizures from excitation/inhibition imbalance, glucose, fever, toxins;
   sleep; consciousness.
7. **Temperature, glucose, hydration, toxins, pH, blood cells, bleeding and clotting.**
8. **Tissue damage and repair**, muscles (strength, fatigue, mass, spasm), bones (density,
   fractures from impacts and from load when giant or heavy), size, age, mana, mutations.
9. **Diseases:** stage effects, progression against the immune system, cures, outcomes;
   spontaneous triggers checked once per second.
10. **Death** when the brain or brainstem fails; the cause is inferred from the state
    (cellular asphyxiation, exsanguination, hyperthermia…). Dead bodies can be defibrillated
    within 90 s, resurrected, reanimated as undead, or destroyed entirely.

Derived *capabilities* (hearing, comprehension, obedience, coordination, strength per limb,
speed, IQ estimate, mood…) are the interface to behaviour, rendering and the monitor.

## Behaviour

A command passes five gates, each tied to anatomy:

| Gate | Depends on | Failure looks like |
| --- | --- | --- |
| Heard? | temporal lobe, consciousness | no reaction |
| Understood? | temporal + frontal, amnesia, hallucination, drunkenness | does a different command |
| Willing? | frontal lobe, rage, fear, love | refuses, snarls or cowers |
| Able? | limb bones, muscle force, paralysis, stiffness | "tries, but the legs are broken" |
| Performed | strength, coordination, gravity, size | stumbles, falls, fractures on landing |

Each performed command is a **test** with a number and a baseline (jump height, lift
capacity, punch force, balance time, gait speed, IQ). Involuntary actions (seizure,
collapse, vomiting, fleeing, rage, hallucination swatting, coughing, howling, fire breath)
pre-empt commands according to priority.

## Rendering

- A **pseudo-3D rig**: joints are computed in a 3D body frame from abduction and flexion
  angles, rotated by yaw (the subject turns toward where it walks) and projected, so walking
  strides and sitting read correctly from a front view. The pelvis is placed so the lowest
  point touches the floor, which makes crouching, sitting and lying automatic.
- **Layers** share the rig: organs and torso details are drawn in torso-local coordinates
  through an affine frame; limbs are tapered capsules. Every layer reacts to state (organ
  colour by health, bone cracks, muscle fatigue colour, nerve signal speed, blood flow speed
  and colour).
- A **follow camera** keeps the subject in view as it walks, jumps, levitates or grows.

## Data contract

`js/data/vocab.js` declares every id: tags, effects, symptoms, organs, brain regions, nerves,
muscles, bones, mutations, transformations, trigger stats, drain keys and disease ids.
Substances, recipes and diseases may only reference those, and the test suite enforces it.

Balance convention: an effect magnitude is the intensity produced by 10 ml of the pure
substance given IV. 0.5 is mild, 1 clear, 2 strong, 4 severe, 8+ lethal. Engine thresholds are
tuned to that scale (sedative 2 asleep, 4 comatose; heat 1 ≈ +2.5 °C; growth 1 ≈ +25 % size).

## Ideas for later

- Multiple subjects side by side for controlled comparisons.
- Saved experiment reports exported from the tests table.
- Contagion between subjects.
- A campaign mode with requests from strange clients.
