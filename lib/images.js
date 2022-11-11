"use strict";

const RegistrySDK = require('../registry-sdk');
const {canonizeImagePath} = RegistrySDK;

const drain   = require('nyks/stream/drain');



class Images {

  constructor(stack) {
    if(!stack) {
      const StackSDK = require('../stack');
      stack = new StackSDK();
    }

    this.stack = stack;
    this.tokens = {};
  }

  async auth_token(registry_auth, registry) {

    if(this.tokens[registry])
      return this.tokens[registry];

    let credentials = (registry_auth && registry_auth.get_registry_auth(registry)) || {};

    let res = await this.stack.request("POST", `/auth`, credentials);

    if(res.statusCode !== 200)
      throw `Invalid login`;

    let creds = JSON.parse(await drain(res));

    if(!creds.IdentityToken)
      creds = credentials;

    let token =  Buffer.from(JSON.stringify(creds)).toString('base64');
    return this.tokens[registry] = token;
  }

  async check_pull(image_name, registry_auth) {
    let image = await this.inspect(image_name).catch(() => false);
    if(!image)
      await this.pull(image_name, registry_auth);
  }

  async pull(image_name, registry_auth) {

    let image = canonizeImagePath(image_name);
    let token = await this.auth_token(registry_auth, image.registry);

    console.log("Should pull", image_name, image, token);
    let qs = {fromImage : image_name};

    let query = {path : `/images/create`, qs};
    if(token)
      query.headers = {'X-Registry-Auth' : token};

    let res = await this.stack.request("POST", query);
    console.log(res.statusCode);

    let progress = () => {};

    res.on('data', function(steps) {
      for(let step of String(steps).trim().split("\n"))
        progress(JSON.parse(step));
    });

    return new Promise((resolve) => {
      res.on('end', resolve);
    });

  }

  async inspect(name) {
    let res = await this.stack.request("GET", `/images/${name}/json`);
    if(res.statusCode !== 200)
      throw `No such image ${name} ${res.statusCode}`;

    let image = JSON.parse(await drain(res));
    return image;
  }

  async list_images(filter = "") {
    let qs = {};
    if(filter)
      qs = {filters : {reference : filter}};

    let res = this.stack.request("GET", {path : "/images/json", qs});
    let images = JSON.parse(await drain(res));

    return images;
  }
}

module.exports  = Images;
