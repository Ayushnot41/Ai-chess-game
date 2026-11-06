# Grandmaster-AI: Google Stitch Design System Master Specification

**Project:** Grandmaster-AI 3D Platform  
**Design System ID:** `ds_grandmaster_obsidian_stitch_v1`  
**Engineered By:** IIT-Grade Full-Stack Architecture  
**Standards:** Google Stitch Design System, WCAG 2.1 AA Accessibility, Framer Motion Dynamics

---

## 1. Spatial Layout & The 24-Step Spatial Scale
All margins, paddings, gap dimensions, and heights strictly adhere to the **24-Step Spatial Scale**:
- `step-1`: 4px (tight badge spacing)
- `step-2`: 8px (icon margins, button padding-y)
- `step-3`: 12px (card inner gap, controls gap)
- `step-4`: 16px (card padding, sidebar margins)
- `step-5`: 20px (section divider spacing)
- `step-6`: 24px (header horizontal padding)
- `step-8`: 32px (modal inner bounds)
- `step-12`: 48px (major HUD component heights)
- `step-16`: 64px (header navigation bar height)
- `step-24`: 96px (maximum responsive container offsets)

---

## 2. Motion System (Framer Motion Physics Easing)
Transitions simulate physical mass and damping:
- **Piece Trajectories**: Quadratic Parabolic Bezier (`$h \cdot 4t(1-t)$`) with ease-in-out curve.
- **HUD Animations**: Gentle Spring (`cubic-bezier(0.16, 1, 0.3, 1)`).
- **Celebratory Popups**: Bouncy Elastic Spring (`cubic-bezier(0.34, 1.56, 0.64, 1)`).

---

## 3. Dual Persona Experience
1. **Professional / IIT Master Mode**:
   - Deep centipawn evaluations, algebraic notation, tactical motif classification, depth selectors (Depth 1-5).
2. **Child-Friendly / Casual Mode**:
   - High-contrast visual indicators, "Play Best Move" one-click button, instant mistake undo, celebratory sound effects, intuitive tooltips.
