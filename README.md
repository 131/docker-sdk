[![Build Status](https://github.com/131/docker-sdk/actions/workflows/test.yml/badge.svg?branch=master)](https://github.com/131/docker-sdk/actions/workflows/test.yml)
[![Coverage Status](https://coveralls.io/repos/github/131/docker-sdk/badge.svg?branch=master)](https://coveralls.io/github/131/docker-sdk?branch=master)
[![Version](https://img.shields.io/npm/v/@131/docker-sdk.svg)](https://www.npmjs.com/package/@131/docker-sdk)


[![License](https://img.shields.io/badge/license-MIT-blue.svg)](http://opensource.org/licenses/MIT)
[![Code style](https://img.shields.io/badge/code%2fstyle-ivs-green.svg)](https://www.npmjs.com/package/eslint-plugin-ivs)


# Motivation

This module provide an API wrapper for [docker](https://docs.docker.com/engine/api/sdk/) & [docker registry](https://docs.docker.com/registry/spec/api/).



# Usage sample
```
export MY_CORP_NAME_REGISTRY_LOCAL_USER=foo
export MY_CORP_NAME_REGISTRY_LOCAL_PASSWORD=bar


npm install @131/docker-sdk

cnyks @131/docker-sdk/registry-sdk my.corp.name.registry.local --ir://run=manifest --image=my.corp.name.registry.local/some/project/path:v1.2.3

```

# Tips
```
# Debug using
socat -v TCP-LISTEN:1234,fork PIPE:/tmp/docker_engine.sock
```

# Credits 
* [131](https://github.com/131)
