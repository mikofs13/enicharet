# Enicharet Studio interface

## Direction

Approved Studio preview, 2026-10-27. People browse on phones in daylight and
review bids on laptops in dim rooms. Both themes need readable text, clear entry
fees and deadlines, large controls, and unambiguous feedback.

## Color

Restrained strategy: cool paper/ink surfaces, cobalt actions, and small apricot
highlights. CSS uses absolute OKLCH values. Approved palette references:

| Role | Light | Dark |
| --- | --- | --- |
| Background | #F6F7FB | #101624 |
| Surface | #FEFEFD | #1B2336 |
| Text | #17213B | #F1F3FA |
| Muted text | #56617A | #B0B9CE |
| Primary | #385BF5 | #9AAEFF |
| Apricot | #FFC6A1 | #FFC6A1 |
| Border | #D8DDE8 | #3B465E |

Primary button text is pale in light mode and ink in dark mode. Apricot surfaces
always use ink text. Inputs use stronger borders than decorative separators.
Semantic error text and fill have separate light and dark tokens.

## Typography

Existing Geist family. Strong, compact page headings; familiar readable form
labels. Landing hero follows the approved “Think small. Dream big.” hierarchy.

## Layout and components

Split landing hero: story and cobalt action on the left, a rounded featured prize
surface on the right. Compact related-prize rows follow, then a three-step guide.
Collection uses product cards; account/history/admin screens retain clear lists
and dividers. Shared controls have 10px radii and main surfaces 18px radii.

Use the auction's saved image when supplied. Otherwise use a clearly labelled
phone/car/jewelry/laptop illustration matching the approved preview. Illustration
does not represent verified inventory, finish, materials, or vehicle specifications.
Actual titles, fees, phases, dates, balances, and history come from the database.

Forms retain persistent labels, phone/OTP fields, and inline errors. Mobile stacks
layouts and provides an expandable navigation menu with Escape and link dismissal.

## Interaction

Buttons expose pending and disabled states. Errors are announced accessibly.
Focus rings remain visible. Navigation uses real links, and logout is a button.
Appearance defaults to System. A sun/moon switch toggles dark mode; the adjacent
System button (monitor icon on mobile) restores automatic appearance. Its pressed
state indicates that the device theme is being followed. Saved manual choices
apply across pages and tabs; an early static script prevents theme flashes.
Without storage, the current-page choice still works.

Navigation uses a 220ms fade and 6px upward settling motion on the main content,
without remounting forms, intercepting links, or delaying interaction. Theme colors,
controls, and menu reveals transition in 160–220ms with decelerating easing.
Reduced-motion preferences disable CSS and route animations, including when
the preference changes during an active route animation.
