# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [0.3.0](https://github.com/flotorch/loadtest/compare/v0.2.8...v0.3.0) (2026-03-06)


### Features

* add prompt generation worker for parallel execution ([e78de6b](https://github.com/flotorch/loadtest/commit/e78de6b992febdf1c68b93dbf8a4f8df473f7991))
* parallelize prompt generation across worker threads ([3019264](https://github.com/flotorch/loadtest/commit/30192649dbbafbf9ecfba64008a10d0bc1ee2955)), closes [#5](https://github.com/flotorch/loadtest/issues/5)

## [0.2.8](https://github.com/flotorch/loadtest/compare/v0.2.7...v0.2.8) (2026-02-25)

## [0.2.7](https://github.com/flotorch/loadtest/compare/v0.2.6...v0.2.7) (2026-02-25)

### Bug Fixes

- fix sagemaker stream processing ([7759b93](https://github.com/flotorch/loadtest/commit/7759b93c30e9880cabf4a545734930de113e8090))
- sagemaker headers ([992a7fa](https://github.com/flotorch/loadtest/commit/992a7fad762b260a02ffedaa706f49c8d562add2))

## [0.2.6](https://github.com/flotorch/loadtest/compare/v0.2.5...v0.2.6) (2026-02-24)

## 0.2.5 (2026-02-24)

### Features

- **metrics:** add emptyResponses tracking and display in stats panel ([6e2e01d](https://github.com/flotorch/loadtest/commit/6e2e01da7b713e0c2e792f61b9b4ca386cd382b9))

### Bug Fixes

- **metrics:** measure TTFT from request start and fix SageMaker ITL accuracy ([#2](https://github.com/flotorch/loadtest/issues/2)) ([e7a9da8](https://github.com/flotorch/loadtest/commit/e7a9da8241aa79c713dfa6e2b963565ca84b69f4))
- **sagemaker:** default to OpenAI messages format for modern LMI/vLLM containers ([#1](https://github.com/flotorch/loadtest/issues/1)) ([4687b2e](https://github.com/flotorch/loadtest/commit/4687b2e312083f03344583bcc0a567b140c2e7b6))

## [0.2.4](https://github.com/flotorch/loadtest/compare/v0.2.3...v0.2.4) (2026-02-20)

### Features

- **metrics:** add emptyResponses tracking and display in stats panel ([6e2e01d](https://github.com/flotorch/loadtest/commit/6e2e01da7b713e0c2e792f61b9b4ca386cd382b9))

## 0.2.3 (2026-02-20)

### Bug Fixes

- **sagemaker:** default to OpenAI messages format for modern LMI/vLLM containers ([#1](https://github.com/flotorch/loadtest/issues/1)) ([4687b2e](https://github.com/flotorch/loadtest/commit/4687b2e312083f03344583bcc0a567b140c2e7b6))
