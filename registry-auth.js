"use strict";

const RegistrySDK = require('./registry-sdk');
const {canonizeImagePath} = RegistrySDK;
const trim   = require('mout/string/trim');

class RegistryAuth {

  constructor(credentials) {
    this.credentials = credentials;
    this.registries  = {};
  }

  get_image_auth(image) {
    let {registry} = canonizeImagePath(image);

    return this.get_registry_auth(registry);
  }

  get_registry_auth(registry) {
    let credentials = this.credentials[registry];

    if(!credentials) {
      let env = trim(registry.toUpperCase().replace(/[^a-z]+/gi,  '_'), '_');
      let user = `${env}_USER`, password = `${env}_PASSWORD`;

      if(!(user in process.env))
        return;

      credentials =  {username  : process.env[user], password : process.env[password]};
    }

    return {serveraddress : registry, ...credentials};
  }

  get_image_manifest(image) {
    image = canonizeImagePath(image);

    let registry = this.get_registry(image.registry);
    return registry.manifest(image);
  }

  get_registry(registry) {
    if(this.registries[registry])
      return this.registries[registry];

    let credentials = this.get_registry_auth(registry);
    this.registries[registry] = new RegistrySDK(registry, credentials);

    return this.registries[registry];
  }




}

module.exports = RegistryAuth;
