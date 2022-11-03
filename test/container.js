"use strict";

const expect = require('expect.js');
const StackSDK= require('../stack');


describe("Stack SDK test suite", function() {

  let stack;

  before("It should ignite docker stack sdk instance", function() {
     stack = new StackSDK("validation");
  });


  it("Should test communication with underlying docker server", async  function (){
    let version = await stack.version();
    expect(version.Version).to.be.ok();
    expect(version.ApiVersion).to.be.ok();
  });

  it("Should do a simple docker run", async function() {

    let specs = {
      "image": "debian:bullseye@sha256:2ce44bbc00a79113c296d9d25524e15d423b23303fdbbe20190d2f96e0aeb251",
      "entrypoint": "/bin/sh",
      "command": ["-c", "echo $((1+1)); exit 1"],
    };

    await stack.container_run(specs);

  });
});


