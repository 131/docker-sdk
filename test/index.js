"use strict";

const expect = require('expect.js');
const RegistrySDK = require('../registry-sdk');
const {canonizeImagePath} = RegistrySDK;

describe("Registry test suite", function() {

  it("Should test canonizeImagePath", function() {

    expect(canonizeImagePath("debian")).to.eql({
      "registry" : "docker.io",
      "path"     : "library/debian",
      "tag"      : "latest",
      "digest"   : undefined,
    });

    expect(canonizeImagePath("rclone/rclone@sha256:f186eb535186c0da798385e1710e09c9bcfadc2a1efa176959d9462d96d9b8b8")).to.eql({
      "registry" : "docker.io",
      "path"     : "rclone/rclone",
      "tag"      : "latest",
      "digest"   : "sha256:f186eb535186c0da798385e1710e09c9bcfadc2a1efa176959d9462d96d9b8b8",
    });


    expect(canonizeImagePath("node:12")).to.eql({
      "registry" : "docker.io",
      "path"     : "library/node",
      "tag"      : "12",
      "digest"   : undefined,
    });

    expect(canonizeImagePath("registry.docker.internal.net/some/project/path:v1.2.0-clyks")).to.eql({
      "registry" : "registry.docker.internal.net",
      "path"     : "some/project/path",
      "tag"      : "v1.2.0-clyks",
      "digest"   : undefined,
    });

    expect(canonizeImagePath("registry-docker-internal-net:5000/some/project/path:v1.2.0-clyks")).to.eql({
      "registry" : "registry-docker-internal-net:5000",
      "path"     : "some/project/path",
      "tag"      : "v1.2.0-clyks",
      "digest"   : undefined,
    });


  });

  /*
  it("should fetch public remote manifests", async() {

    rclone/rclone@sha256:f186eb535186c0da798385e1710e09c9bcfadc2a1efa176959d9462d96d9b8b8

    postgres:9.6
  });
*/

});


