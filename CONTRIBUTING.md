# Contributing

Thanks for helping improve ClickGuide Local.

## Development Setup

```powershell
npm.cmd install
npm.cmd run build
```

Use `npm install` and `npm run build` on macOS or Linux.

## Pull Request Guidelines

- Keep changes focused on one feature or fix.
- Run `npm.cmd run build` before opening a pull request.
- Do not commit generated packages such as `dist/`, `release/`, `*.zip`, or `*.pptx`.
- Avoid adding code that sends recorded screenshots, URLs, or notes to an external service unless the privacy model is explicitly redesigned and documented.

## Privacy-Sensitive Changes

Changes to permissions, screenshot capture, storage, export behavior, or sensitive-field filtering should include an explanation in the pull request body.
