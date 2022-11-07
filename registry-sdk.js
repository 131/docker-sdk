"use strict";

const url       = require('url');

const debug     = require('debug');

const trim      = require('mout/string/trim');

const headerParse = require('nyks/http/header/parse');
const stripStart  = require('nyks/string/stripStart');

const request     = require('nyks/http/request');
const drain       = require('nyks/stream/drain');
const eachLimit   = require('nyks/async/eachLimit');

const log = {
  info  : debug("docker-sdk:info"),
  error : debug("docker-sdk:error"),
  debug : debug("docker-sdk:debug"),
};


const TYPE_MANIFEST      = "application/vnd.docker.distribution.manifest.v2+json";
const TYPE_MANIFEST_LIST = "application/vnd.docker.distribution.manifest.list.v2+json";

class RegistrySDK {

  constructor(name, credentials = null, secured = undefined) {
    let env = trim(name.toUpperCase().replace(/[^a-z]+/gi,  '_'), '_');
    let user = `${env}_USER`, password = `${env}_PASSWORD`;

    if(user in process.env)
      credentials =  {username  : process.env[user], password : process.env[password]};

    this.name        = name;
    this.credentials = credentials;
    this.secured     = secured === undefined ? true : !!secured;
    this.tokens      = {};
  }

  async all_manifests(path) {

    let {tags} = await this.query(`${path}/tags/list`);
    let manifests = {};
    await eachLimit(tags, 10, async (tag)  => {
      manifests[tag] = await this.manifest(`${path}:${tag}`);
    }, this);


    return manifests;
  }

  async manifest(image) {
    image = RegistrySDK.canonizeImagePath(image);
    return this.query(`${image.path}/manifests/${image.tag}`);
  }


  async tags_list(image) {
    image = RegistrySDK.canonizeImagePath(image);
    let {tags} = await this.query(`${image.path}/tags/list`);
    return tags;
  }

  async query(path = '') {

    let registry = this.name;
    if(this.name == "docker.io")
      registry = "registry-1.docker.io"; // ...

    let remote = `${this.secured ? "https" : "http"}://${registry}/v2/${path}`;

    let query = {
      ...url.parse(remote),
      method : 'GET',
      reqtimeout  : 900 * 1000,
      followRedirect : true,
      headers : {'Accept' : [TYPE_MANIFEST, TYPE_MANIFEST_LIST]},
    };


    if(this.tokens.default)
      query.headers.Authorization = `Bearer ${this.tokens.default}`;

    log.debug("Query", url.format(query), {path});

    const manifest_res1 = await request(query);

    log.info("Got query response", this.name, manifest_res1.statusCode);
    if(manifest_res1.statusCode === 200) {
      let body = await drain(manifest_res1);
      return JSON.parse(body);
    }

    delete this.tokens.default;

    if(manifest_res1.statusCode !== 401)
      throw `Unsupported authenticate: HTTP ${manifest_res1.statusCode} for ${query.href}`;

    if(!('www-authenticate' in manifest_res1.headers))
      throw `Unable to find auth URL for ${query.href}`;

    const www_auth = headerParse(stripStart(manifest_res1.headers['www-authenticate'], 'Bearer ').trim());

    const auth_query = {
      ...url.parse(www_auth.realm),
      qs : {service : www_auth.service, scope : www_auth.scope},
      json : true,
      headers : {},
    };

    if(this.credentials)
      auth_query.headers.Authorization = 'Basic ' + Buffer.from(`${this.credentials.username}:${this.credentials.password}`).toString('base64');


    log.info("Authenticating over", this.name);
    log.debug("auth_query", auth_query);
    const auth_res  = await request(auth_query);
    const auth_body = await drain(auth_res);
    if(auth_res.statusCode !== 200) {
      if(!this.crendentials)
        throw `Credentials (username/password) not found for registry '${this.name}'`;
      throw `Unable to authenticate`;
    }

    const {token} = JSON.parse(auth_body);


    query.headers.Authorization = `Bearer ${token}`;

    const manifest_res2 = await request(query);
    if(manifest_res2.statusCode !== 200)
      throw `Manifest not found on ${this.name} for ${path}`;

    this.tokens.default = token; //this might be smarter

    return JSON.parse(await drain(manifest_res2));
  }



  static canonizeImagePath(image_name) {

    if(typeof image_name != "string")
      return image_name;

    if(!image_name.includes('/'))
      image_name = `library/${image_name}`; // "debian:bulleyes";

    let hostname;
    let tmp = split2(image_name, '/');
    [hostname, image_name] = tmp[0].includes('.') || tmp[0].includes(':') ? tmp : ['docker.io', image_name];

    let digest, tag;

    [image_name, digest] = image_name.includes('@') ? split2(image_name, '@') : [image_name];
    [image_name, tag] = image_name.includes(':') ? split2(image_name, ':') : [image_name, 'latest'];

    return {registry : hostname, path : image_name, tag, digest};
  }


}

const split2 = function(str, delim) {
  let [a, ...b] = str.split(delim);
  return [a, b.join(delim)];
};

module.exports = RegistrySDK;
