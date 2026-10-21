# Contributing

SoundCloud Listen Along is in early development. Small, reviewable changes that keep its privacy-minimal design (no accounts, no tracking, only playback state leaves the browser) are preferred.

## Before starting

- Search [issues](https://github.com/vladi245/soundcloud-listen-along/issues) and [pull requests](https://github.com/vladi245/soundcloud-listen-along/pulls).
- Open an issue before a large feature, protocol change, new permission, or privacy-affecting change.
- Use [private security reporting](SECURITY.md) for vulnerabilities, not a public issue.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Local workflow

```sh
git clone https://github.com/vladi245/soundcloud-listen-along.git
cd soundcloud-listen-along
npm ci
npm run check
npm run build:all
```

Use `npm run dev` for Chromium development or `npm run dev:firefox` for Firefox development. Do not commit generated `.output/` or `.wxt/` files.

## Pull requests

- Keep each pull request focused and explain user-visible, permission, protocol, and privacy effects.
- Add or update tests for changed behavior, and describe any manual verification on SoundCloud.
- Run `npm run check` and `npm run build:all` before requesting review.
- Update relevant documentation when behavior, setup, permissions, data handling, or distribution changes.
- Do not add SoundCloud logos, artwork, or imply affiliation or endorsement.

By contributing, you agree that your contribution is licensed under the repository's [MIT License](LICENSE).
