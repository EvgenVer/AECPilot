# SPECIFICATION — Reading list

## Requirements

- Read title and URL columns from a user-selected CSV file.
- Export one Markdown link per valid row, preserving input order.
- Explain invalid rows and leave an existing destination untouched on failure.
- Provide command help and return a nonzero exit code for invalid input.

## Constraints and non-goals

- Work offline. Do not fetch URLs, upload files, or store credentials.
- No graphical interface or synchronization service.

## Acceptance

- A valid two-row CSV produces two ordered Markdown links.
- Invalid input produces an actionable error and does not damage existing output.
- Help explains the input, output, and failure behavior.
