"use strict";

const RegistrySDK = require('../registry-sdk');
const {canonizeImagePath} = RegistrySDK;

const trim   = require('mout/string/trim');
const drain   = require('nyks/stream/drain');



class Images {

  constructor(stack) {
    if(!stack) {
      const StackSDK = require('../stack');
      stack = new StackSDK();
    }

    this.stack = stack;
  }

  async auth() {
    let serveraddress = "docker.io";
    let env = trim(serveraddress.toUpperCase().replace(/[^a-z]+/gi,  '_'), '_');
    let user = `${env}_USER`, password = `${env}_PASSWORD`;

    if(!(user in process.env))
      return;

    let credentials =  {serveraddress, username  : process.env[user], password : process.env[password]};

    let res = await this.stack.request("POST", `/auth`, credentials);

    if(res.statusCode !== 200)
      throw `Invalid login`;

    let creds = JSON.parse(await drain(res));

    if(!creds.IdentityToken)
      return credentials;

    return creds;
  }

  async check_pull(image_name) {


    let image = await this.inspect(image_name).catch(() => false);
    if(!image)
      await this.pull(image_name);
  }

  async pull(image_name) {

    let image = canonizeImagePath(image_name);

    //    if(!this.token)
    //      this.token = Buffer.from(JSON.stringify(await this.auth())).toString('base64');


    console.log("Should pull", image_name, image);
    let qs = {fromImage : image_name};

    let query = {path : `/images/create`, qs}; //, headers : {'X-Registry-Auth' : this.token}
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
