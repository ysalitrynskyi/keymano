# Community keyboard templates

Keymano welcomes community `.keylayout` examples when licensing and provenance are clear.

Required submission data:

- `.keylayout` file or `.bundle.zip`;
- layout name and language/script;
- base keyboard used to create it;
- license for the layout data;
- confirmation that you have the right to submit it;
- short preview or reference sheet;
- known limitations or macOS versions tested.

Review checklist:

1. Parse with `keylayout-core`.
2. Validate with zero errors.
3. Round-trip serialize and compare semantic behavior.
4. Check declared alphabet coverage when the submission claims one.
5. Confirm no copied proprietary Apple layout or third-party layout without permission.

Do not submit private, workplace, or paid layouts unless the owner has approved redistribution.
