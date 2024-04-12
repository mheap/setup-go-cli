# setup-go-cli

This action allows you to install a CLI built with `goreleaser` in GitHub Actions

## Sample workflow

```yaml
on:
  push:
    branches:
      - main
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      # This is not a real CLI. Switch the `with` values to your own repository
      - uses: mheap/setup-go-cli@v1
        with:
          owner: mheap
          repo: demo-cli
          cli_name: demo
      - run: demo version
```

You can also specific a specific version to install with the `version` input:

```yaml
- uses: mheap/setup-go-cli@v1
  with:
    owner: mheap
    repo: demo-cli
    cli_name: demo
    version: 1.2.3
```
