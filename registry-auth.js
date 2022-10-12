"use strict";

const RegistrySDK = require('./registry-sdk');
const {canonizeImagePath} = RegistrySDK;

class RegistryAuth {

  constructor(credentials) {
    this.credentials = credentials;
    this.registries  = {};
  }

  get_image_auth(image) {
    let {registry} = canonizeImagePath(image);
    return this.crendentials[registry];
  }

  get_image_manifest(image) {
    image = canonizeImagePath(image);

    let registry = this.get_registry(image.registry);
    return registry.manifest(image);
  }

  get_registry(registry) {
    if(this.registries[registry])
      return this.registries[registry];

    this.registries[registry] = new RegistrySDK(registry, this.credentials[registry]);
    return this.registries[registry];
  }




}

module.exports = RegistryAuth;
