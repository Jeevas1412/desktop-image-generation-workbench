# Contributing

## Before opening a change

1. Do not add model weights, generated images, prompts, logs, secrets, private addresses or personal paths.
2. Keep renderer code free of Node, SSH, credentials and arbitrary network targets.
3. Add tests for new workflow, IPC, filesystem or download behavior.

## Verification

Run the frontend, backend and desktop test commands listed in the README. For a change that can affect packaging, also run the desktop syntax check and inspect the unpacked artifact for excluded user/model content.

## High-impact changes

Model installation, binding, generation, stopping jobs and clearing the semifinished library must retain their existing plan/confirmation/verification/audit boundaries.
