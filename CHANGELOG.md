# Changelog

All notable changes to this project will be documented in this file.

## [0.1.1-alpha.35] - 2026-07-23

### Changed

- Prepared the next public-source candidate without rewriting the verified private Alpha34 release assets.
- Public-facing text now consistently describes the product as a non-commercial research, learning, and non-production Alpha project. This is project positioning only; the source license remains Apache-2.0.
- Replaced the source test fixtures that contained a real DGX hostname or private endpoint with generic local-network examples.

### Release requirements

- A new GitHub-built installer must have its SHA-256 checked and pass a clean Windows installation validation before it can be published as a public prerelease.

## [0.1.1-alpha.33] - 2026-07-22

### Fixed

- The top-bar ComfyUI probe now strips saved verification provenance before private-endpoint validation. A verified, working ComfyUI no longer falls through to the false “currently unreachable” state.
- Added a regression test for a persisted connection profile that includes `verifiedAt`.

## [0.1.1-alpha.32] - 2026-07-22

### Added

- Semifinished-library cards now show their real VLM score, pass state, summary, issues, and copy-only prompt patch after review. New generated rounds persist their returned review alongside the archived library item.
- Existing archived images show an explicit “No VLM review yet” state and offer a user-triggered **Run VLM review** action. The review is saved locally by exact library item ID; it uses the originating saved prompt when one is available and never fabricates historical scores.

## [0.1.1-alpha.31] - 2026-07-22

### Fixed

- The header now uses the same bounded, read-only ComfyUI probe as real-generation preflight. A successful task submission or real LoRA scan immediately marks that verified connection reachable, preventing a running task from being labelled unreachable.

### Added

- Each archived generation round can now request one review from the separately configured VLM. The preview column shows only returned score, pass state, Chinese feedback, and a copy-only English prompt patch. If no VLM Profile is saved, the UI explicitly reports that review did not run; it never invents a score.
- VLM review is best-effort and serialized after a completed round. It cannot submit, cancel, restart, or clear ComfyUI work, and a VLM error does not turn an already completed image generation into a failure.

## [0.1.1-alpha.30] - 2026-07-22

### Added

- Pony workbenches now expose the original source-style and content-rating selectors. Their exact `source_*` and `rating_*` tags are validated, applied to the submitted Pony prompt, and retained in PNG generation metadata.
- The workbench now shows the selected generation core as a dedicated card and saves editable prompt/settings drafts locally across page navigation. Reference-file handles remain session-bound and are not persisted.

### Fixed

- The application header now rechecks the saved ComfyUI profile on focus and every 15 seconds using the fixed read-only endpoint, and shows the actual checked host/port when unavailable.

## [0.1.1-alpha.29] - 2026-07-22

### Fixed

- The desktop application now owns a single-instance lock. Starting it again restores and focuses the existing window instead of creating a second renderer process.
- The ComfyUI connection form accepts a pasted `http://host:port` value, safely extracts the host and port, and explains conflicting or unsupported URL input before any request is sent.

## [0.1.1-alpha.28] - 2026-07-22

### Added

- Only the registered Pony, Illustrious and FLUX cores can now be bound. Each binding rechecks the currently discovered workflow dependencies; arbitrary checkpoints remain visible as unverified and cannot start a task. ComfyUI's read-only API does not expose SHA-256, so cryptographic provenance remains an explicit release gate.
- The displayed application version is injected from the frontend build package. Connection UI distinguishes saved/stale/live-unreachable states instead of treating a saved Profile as a reachable service.
- Reference, library, and generated-image previews now transfer a bounded 512px PNG thumbnail on demand. The renderer no longer loads every original image during a library or job refresh.
- Task records persist under the application data directory. On restart, a non-terminal task is never resubmitted or interrupted; it is explicitly handed off to its recorded ComfyUI prompt IDs for history review.

### Known limitations

- Clean Git provenance, a signed installer, full core-file hash evidence, and real DGX acceptance remain pending.

## [Unreleased]

## [0.1.1-alpha.27] - 2026-07-22

### Fixed

- ComfyUI and VLM now use independent, separately verified local-network Profiles. VLM translation resolves and verifies its address on every request, then uses the verified numeric private address for fixed model and chat routes.
- Stopping a multi-round job now waits for the already submitted round to reach a terminal state and archive its output; it prevents only future submissions.
- Multi-round jobs now accurately report `completed`, `partial_failed`, `failed`, or `stopped` from their actual round outcomes.

## [0.1.1-alpha.26] - 2026-07-22

### Added

- The semifinished library now exposes **Clear current contents**. It first presents the exact image count and size, then requires a separate confirmation click before deletion.

### Safety

- Cleanup is limited to the workbench-owned semifinished root. The existing short-lived plan, ownership marker, file manifest, and content-change recheck remain mandatory; ComfyUI output, models, and unrelated folders are outside this action.

## [0.1.1-alpha.25] - 2026-07-22

### Added

- `FLUX.1 Dev 真实通用` is now a first-class image-generation core. The saved Flux checkpoint selection builds the verified Kontext graph using `UNETLoader`, `DualCLIPLoader`, `FluxGuidance`, and `ae.safetensors`.
- Flux accepts only LoRAs found in ComfyUI's explicit `Flux/` directory; Pony and Illustrious remain restricted to explicit `SDXL/` LoRAs.

### Fixed

- Starting Flux now preflights its UNET, VAE, `clip_l`, and `t5xxl_fp16` dependencies and reports the exact missing dependency without submitting a shared ComfyUI task.
- The studio labels Flux separately from the two animation-portrait cores and uses Flux's 3.5 guidance default when opening the Flux workbench.

## [0.1.1-alpha.24] - 2026-07-22

### Fixed

- Pony and Illustrious now list only LoRAs discovered in ComfyUI's explicit `SDXL/` directory. Flux, SD1.5, and unclassified root LoRAs are hidden and rejected again at submission.
- A real LoRA in a ComfyUI subfolder is now accepted by the bounded IPC validation and then matched exactly against the latest SDXL discovery result.
- Start-generation feedback is shown next to the button while it checks the queue, succeeds, or reports why it did not submit.

## [0.1.1-alpha.23] - 2026-07-22

### Fixed

- The Start generation button no longer exits silently when its preconditions are incomplete. It now explains whether the desktop IPC bridge, verified core, or positive prompt is missing.

### Verified

- The frontend test now proves that a supplied positive prompt produces exactly one `image:job:start` IPC request. A live read-only ComfyUI preflight confirmed the saved Illustrious core and SDXL VAE exist and the queue was idle.

## [0.1.1-alpha.22] - 2026-07-22

### Fixed

- LoRA model and text strengths now occupy a dedicated, always-visible second row below the LoRA selector. They remain visibly disabled until a real LoRA is selected.
- The round/Seed explanatory text now has its own wrapped row, preventing it from overlapping controls in the two-column image-studio layout.

## [0.1.1-alpha.21] - 2026-07-22

### Added

- The image studio now translates the Chinese guided-prompt draft (or the current positive prompt when no draft exists) through the connected VLM into an editable English result. The result is not applied until the user explicitly chooses **Write to positive prompt**.

### Fixed

- Translation uses deterministic text-only instructions and UTF-8 request encoding. A real DGX smoke test verified that subject, full-body framing, lighting, color tone, and depth-of-field requirements remain in the returned English prompt.

## [0.1.1-alpha.14] - 2026-07-21

### Added

- Users can select a real ComfyUI checkpoint as the image-generation core and persist that selection locally only after a fresh, fixed read-only scan confirms it exists.
- The workbench now shows the saved core selection and routes unselected users back to the real checkpoint selector.

## [0.1.1-alpha.13] - 2026-07-21

### Fixed

- Model status no longer displays the internal `COMFYUI_PROFILE_SAVED` code as a user-facing result.
- Selecting “读取真实模型状态” from the connected workbench now explicitly triggers the fixed read-only model and queue scan.

## [0.1.1-alpha.12] - 2026-07-21

### Fixed

- The global header now reads the same saved ComfyUI Profile as the connection page and changes immediately after successful verification.
- The workbench distinguishes an already verified connection from the separate pending model scan and routes users to the real scan instead of asking them to reconnect.

## [0.1.1-alpha.11] - 2026-07-21

### Added

- The LAN connection path now shows copyable terminal commands for obtaining the running ComfyUI machine's IP address and listener port on DGX/Linux and Windows.

## [0.1.1-alpha.10] - 2026-07-21

### Fixed

- First launch no longer selects a connection location or displays a host/port value. Selecting a location also clears unverified fields; only a previously verified Profile can restore values.
- Port `8188` is now an input hint only, not a silently presented configuration.

## [0.1.1-alpha.9] - 2026-07-21

### Fixed

- Packaged Windows renderer IPC now verifies the sender against Electron's actual loaded file URL, avoiding a false rejection caused by file-URL normalization.

## [0.1.1-alpha.8] - 2026-07-21

### Fixed

- Connection verification now requests only the fixed read-only `/object_info` endpoint. Queue inspection happens later, only when the user explicitly reads actual models and status.
- When the local desktop bridge rejects or cannot complete a request, the connection page now shows a concrete recovery instruction instead of treating it as a ComfyUI configuration failure.

## [0.1.1-alpha.7] - 2026-07-21

### Added

- First-run connection choices for this computer, another LAN computer, an existing secure remote path, or no ComfyUI installation.
- A user-triggered, fixed read-only ComfyUI scan that displays actual node-derived candidates and queue counts only after a saved Profile exists.

### Changed

- Port `8188` is now described as an editable common suggestion, not a universal deployment fact; the generic UI no longer uses the DGX-specific `dgx.local` example.

## [0.1.1-alpha.6] - 2026-07-21

### Fixed

- Accept the non-public RFC 2544 `198.18.0.0/15` DGX local fabric range for the fixed, read-only ComfyUI connection preflight. Public-network destinations remain blocked.

## [0.1.1-alpha.5] - 2026-07-21

### Added

- Users can complete no-credential ComfyUI wiring in the desktop UI: enter a LAN host and port, verify the fixed read-only endpoint, and save the profile locally only after successful verification.

### Security

- The saved profile contains only host and port. Passwords, tokens, SSH keys, command fields, arbitrary paths, and public-network destinations remain rejected.

## [0.1.1-alpha.4] - 2026-07-21

### Changed

- Removed every runtime Mock capability, download, task, image-library, LoRA, score and generated-image record from user-facing pages.
- Replaced fabricated content with explicit real empty, unconfigured, or local-library states.
- Replaced the global Mock Mode label with the truthful ComfyUI connection state.

## [0.1.1-alpha.3] - 2026-07-21

### Added

- A dedicated “Connect ComfyUI” page for a user-provided LAN host and port.
- Fixed, private-network-only `GET /object_info` ComfyUI connection verification through the Electron IPC boundary.

### Changed

- The connection target is explicitly named ComfyUI service; model discovery and binding remain separate controlled workflows.
- Connection verification uses `/object_info`, following the recorded read-only DGX probe where `/system_stats` timed out.

### Known limitations

- The page is a no-credential LAN preflight only. It does not persist a DGX profile, use SSH, submit jobs, or validate a full generation workflow.

## [0.1.1-alpha.2] - 2026-07-21

### Added

- System-tray icon with restore and explicit exit actions; closing the main window hides it to the tray.
- Low-saturation canvas-and-brush application icon for desktop, tray and future installer use.

### Changed

- Public-tree verification now also scans modified tracked files before release preparation.

## [0.1.1-alpha.1] - 2026-07-21

### Added

- Apache License 2.0 project license and package metadata.
- Structured film-prompt helper in the offline UI.
- Explicit desktop composition root with safe not-configured behavior.
- GitHub Draft/Prerelease workflow for clearly labelled Unsigned Alpha artifacts.
- SHA-256, SPDX SBOM, release manifest and GitHub provenance preparation.

### Changed

- Capability verification now uses hash, architecture-family and workflow-smoke evidence.
- Semifinished cleanup now requires plan creation followed by plan ID confirmation.
- Seed mode is consistently named `range_increment` across UI, contract and job controller.

### Security

- Empty or relative library roots are rejected.
- Public-tree and packaged-artifact scans reject model weights, secrets and cache-like files.

### Known limitations

- The Windows installer is not Authenticode signed and may be blocked as an unknown publisher.
- This version is Alpha / Offline Mock / non-production and has not completed real DGX validation.
