# Compliance Notes

## Purpose

This document records release and deployment questions for maintainers, contributors, and self-hosting operators. It is not legal advice, a legal opinion, certification, or approval. Laws, contracts, platform terms, and store policies vary by jurisdiction and can change; responsible parties should obtain their own advice.

## Project positioning

- The project is independent and unofficial.
- The SoundCloud name is used only to describe compatibility.
- Distribution materials must not claim affiliation, authorization, sponsorship, or endorsement.
- SoundCloud logos, artwork, and other brand marks must not be included without permission.
- Users access media through SoundCloud; this project must not redistribute audio or bypass access, advertising, payment, territorial, or technical controls.

SoundCloud and related marks remain the property of their respective owners. Compatibility wording does not grant trademark rights.

## Maintainer release checklist

- Review current browser-store policies and SoundCloud terms before each release.
- Keep host and extension permissions limited and explain each permission accurately.
- Ensure store disclosures match actual collection, sharing, remote-code, and backend behavior.
- Publish accurate privacy documentation before implementing data flow.
- Inventory third-party dependencies and preserve required license notices.
- Document security reporting, release provenance, and update behavior.
- Reassess the project if player integration requires circumvention, undocumented credentials, or collection beyond synchronization needs.

## Backend operator responsibilities

A backend operator is separate from the extension maintainers and controls its deployment. Depending on the deployment, the operator may need to:

- identify itself and provide privacy notices;
- establish an appropriate basis and purpose for processing personal data;
- configure retention, deletion, access, subprocessors, and cross-border transfers;
- protect room credentials, logs, and network traffic;
- handle participant requests and security incidents;
- assess child-safety, employment, education, accessibility, consumer, or sector-specific rules;
- comply with hosting contracts and applicable platform terms.

The open-source license does not transfer these obligations to project maintainers or establish that any deployment is compliant.

## Distribution status

Chromium use is by developer-mode unpacked installation, with an in-popup notice when a newer version is published. Firefox builds are signed by AMO as an unlisted add-on and self-distributed from the public room server with automatic updates. Neither path implies approval by SoundCloud, legal compliance, security certification, or fitness for a particular deployment.
