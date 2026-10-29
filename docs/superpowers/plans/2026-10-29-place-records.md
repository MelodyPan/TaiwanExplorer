# Place Records Implementation Plan
> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task.
**Goal:** Maintain personal place records across devices with private Google Drive.
**Architecture:** Adapt the existing bookmarks Drive and session engines with an independent schema and application identity; Angular owns the login controls and editor.
**Tech Stack:** Angular 14, TypeScript, Leaflet, Google Identity Services, Drive REST.
**Spec:** ../specs/2026-10-29-place-records-design.md
## Global Constraints
CSR, no new backend, private records, no bookmarks writes, preserve existing uncommitted work.
## Review Focus
Expired authorization disables editing; stale writes produce a choice; response loss retries original operation; invalid record input rejected; closing/reopening editor preserves unsaved changes.
### Task 1: Drive records
Files: src/assets/records/{record-file,record-drive,record-cloud,record-login}.js; tests/record-*.test.cjs.
Interfaces: readDataFile(text), createDataFile(records), createDriveStore(options), createCloudSession(options).
- [x] Add schema tests and adapted Drive/session regression tests; run and observe missing-module failure.
- [x] Adapt engines with independent namespace, strict schema, and daily records filenames.
- [x] Run node --test tests/record-*.test.cjs; expect all pass.
### Task 2: Angular editor and login
Files: core/services/place-records.service.ts, components/place-records/*, app.module.ts, place list and marker service.
Interfaces: open(place), save(placeId,record), record(placeId), connect(), session state.
- [x] Implement five-star and tri-state fields, optional explanation, explicit save, private status, backup, retry/conflict controls.
- [x] Connect marker popup and list buttons; preserve public map and hidden filters.
- [x] Build and verify mobile UI, logged-out behavior and mocked Drive round trip.
### Task 3: Delivery
- [x] Review changes, run regression tests and build, document Drive setup.
- [ ] Commit selected files, push and publish authorized GitHub Pages update; verify deployed assets.
